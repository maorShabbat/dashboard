import { useRef, useState } from 'react';
import { sniffFont } from '../../core/bundle/export';
import { sniffMime } from '../../core/bundle/verify';
import { BUILTIN_FONTS } from '../../core/fonts';
import type { LicenseInfo } from '../../core/fonts';
import { BUILTIN_LICENSE, BUILTIN_SPRITES } from '../../core/model/builtinAssets';
import { MEDIA_LIMITS, looksUnsafeSvg } from '../../core/model/exchange';
import { addMedia, addUserFont, removeMedia, removeUserFont, updateMedia } from '../../core/model/ops';
import { collectPresetRefs, collectSequenceRefs, collectThemeRefs } from '../../core/model/refs';
import type { MediaItem, MediaKind, Project } from '../../core/model/types';
import { newId, slugify } from '../../core/util/ids';
import { sha256Hex } from '../../core/util/sha256';
import { ConfirmButton } from '../components/AssetChrome';
import { useCommit, useProject, useStudio } from '../studio';
import { registerUserFonts } from '../fonts';

const PRESETS: { key: string; label: string; info: LicenseInfo }[] = [
  { key: 'unknown', label: 'Not declared yet (not bundled)', info: { id: 'custom', name: 'Undeclared', redistributable: false } },
  { key: 'proprietary', label: 'Proprietary: no redistribution (not bundled)', info: { id: 'proprietary', name: 'Proprietary, all rights reserved', redistributable: false } },
  { key: 'CC0-1.0', label: 'CC0 1.0 public domain', info: { id: 'CC0-1.0', name: 'CC0 1.0 Universal', url: 'https://creativecommons.org/publicdomain/zero/1.0/', redistributable: true } },
  { key: 'CC-BY-4.0', label: 'CC BY 4.0 (attribution required)', info: { id: 'CC-BY-4.0', name: 'Creative Commons Attribution 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', redistributable: true } },
  { key: 'OFL-1.1', label: 'SIL Open Font License 1.1', info: { id: 'OFL-1.1', name: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org', redistributable: true } },
  { key: 'MIT', label: 'MIT', info: { id: 'MIT', name: 'MIT License', url: 'https://opensource.org/license/mit', redistributable: true } },
  { key: 'custom-ok', label: 'Custom licence that permits redistribution', info: { id: 'custom', name: 'Custom licence (redistribution permitted)', redistributable: true } },
];

const EXT_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', wav: 'audio/wav', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', webm: 'audio/webm', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

function LicenseForm({ value, onChange, idPrefix }: { value: LicenseInfo; onChange(l: LicenseInfo): void; idPrefix: string }) {
  const key = PRESETS.find((p) => p.info.id === value.id && p.info.redistributable === value.redistributable && (p.key !== 'custom-ok' || value.id === 'custom'))?.key ?? 'custom-ok';
  return (
    <div className="license-form" data-testid={`${idPrefix}-license`}>
      <label>Licence <select value={key} onChange={(e) => { const p = PRESETS.find((x) => x.key === e.target.value)!; onChange({ ...p.info, ...(value.holder ? { holder: value.holder } : {}), ...(value.attribution ? { attribution: value.attribution } : {}), ...(value.text ? { text: value.text } : {}) }); }} data-testid={`${idPrefix}-license-preset`}>
        {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
      <label>Rights holder <input value={value.holder ?? ''} onChange={(e) => onChange({ ...value, holder: e.target.value })} placeholder="Name or company" data-testid={`${idPrefix}-holder`} /></label>
      <label>Attribution line <input value={value.attribution ?? ''} onChange={(e) => onChange({ ...value, attribution: e.target.value })} placeholder="Credit text to ship with the file" /></label>
      <label>Licence URL <input value={value.url ?? ''} onChange={(e) => onChange({ ...value, url: e.target.value })} placeholder="https://…" /></label>
      <label>Licence text (optional) <textarea rows={2} value={value.text ?? ''} onChange={(e) => onChange({ ...value, text: e.target.value })} /></label>
      <p className={`small ${value.redistributable ? 'ok-text' : 'warn-text'}`}>{value.redistributable ? '✓ May be packaged into bundles together with its licence text.' : '⚠ Will NOT be packaged into bundles: it is listed as omitted instead.'}</p>
    </div>
  );
}

export function usageOf(p: Project, mediaId: string, fontIds: string[] = []): string[] {
  const used: string[] = [];
  const has = (r: { assets: Set<string>; fonts: Set<string> }) => r.assets.has(mediaId) || fontIds.some((f) => r.fonts.has(f));
  for (const t of Object.values(p.themes)) if (has(collectThemeRefs(t.draft)) || t.versions.some((v) => has(collectThemeRefs(v.content)))) used.push(`theme “${t.name}”`);
  for (const pr of Object.values(p.presets)) if (has(collectPresetRefs(pr.draft)) || pr.versions.some((v) => has(collectPresetRefs(v.content)))) used.push(`preset “${pr.name}”`);
  for (const s of Object.values(p.sequences)) if (has(collectSequenceRefs(s.draft))) used.push(`sequence “${s.name}”`);
  return used;
}

export function MediaView() {
  const project = useProject();
  const studio = useStudio();
  const commit = useCommit();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<MediaKind>('image');
  const [file, setFile] = useState<File | null>(null);
  const [license, setLicense] = useState<LicenseInfo>(PRESETS[0]!.info);
  const [family, setFamily] = useState('');
  const [weight, setWeight] = useState(400);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const mime = (file.type && MEDIA_LIMITS[kind].mimes.includes(file.type) ? file.type : EXT_MIME[ext]) ?? '';
      if (!MEDIA_LIMITS[kind].mimes.includes(mime)) throw new Error(`Unsupported ${kind} type “${file.type || ext}”`);
      if (bytes.length > MEDIA_LIMITS[kind].bytes) throw new Error(`File is larger than the ${Math.round(MEDIA_LIMITS[kind].bytes / 1048576)} MB limit for ${kind} files`);
      if (kind === 'font') { if (!sniffFont(bytes)) throw new Error('This does not look like a font file (woff2, woff, ttf or otf)'); }
      else {
        const s = sniffMime(bytes);
        const ok = s === mime || (s === 'audio/wav' && mime === 'audio/x-wav');
        if (!ok) throw new Error(`The file content (${s ?? 'unknown'}) does not match its type (${mime})`);
        if (mime === 'image/svg+xml' && looksUnsafeSvg(bytes)) throw new Error('This SVG contains scripts or active content and was rejected');
      }
      if (kind === 'font' && !family.trim()) throw new Error('Enter the font family name');
      const hash = await studio.blobs.put(bytes);
      const existing = Object.values(project.media).find((m) => m.hash === hash);
      const item: MediaItem = { id: existing?.id ?? newId('m'), kind, name: file.name, mime, size: bytes.length, hash, license };
      if (kind === 'font') {
        const fid = `font_${slugify(family)}`;
        commit('Add font', (p) => {
          let n = existing ? p : addMedia(p, item);
          const prev = p.fonts[fid];
          n = addUserFont(n, { id: fid, label: family.trim(), family: family.trim().replace(/["\\]/g, ''), fallback: 'system-ui, sans-serif', license, files: [...(prev?.files.filter((f) => f.weight !== weight) ?? []), { weight, style: 'normal', mediaId: item.id }] });
          return n;
        });
        await registerUserFonts(studio.store.state, studio.blobs);
      } else if (!existing) commit(`Add ${kind}`, (p) => addMedia(p, item));
      await studio.media.sync(studio.store.state);
      studio.toasts.push(`Added ${file.name}${license.redistributable ? '' : ' (not bundled until its licence is declared redistributable)'}`, license.redistributable ? 'ok' : 'warn');
      // Never carry a licence over to the next file: every file must be declared on its own.
      setFile(null); setFamily(''); setLicense(PRESETS[0]!.info); if (fileRef.current) fileRef.current.value = '';
    } catch (e) { studio.toasts.push((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  const items = Object.values(project.media).filter((m) => m.kind !== 'font');
  const fontMediaIds = new Set(Object.values(project.fonts).flatMap((f) => f.files.map((x) => x.mediaId)));

  return (
    <div className="view media-view" data-testid="media-view">
      <section className="card">
        <h3>Add a file</h3>
        <div className="seg" role="tablist">{(['image', 'audio', 'font'] as const).map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setFile(null); setLicense(PRESETS[0]!.info); if (fileRef.current) fileRef.current.value = ''; }} data-testid={`media-kind-${k}`}>{k[0]!.toUpperCase() + k.slice(1)}</button>)}</div>
        <div className="form-grid">
          <label>File <input ref={fileRef} type="file" accept={kind === 'image' ? 'image/*' : kind === 'audio' ? 'audio/*' : '.woff2,.woff,.ttf,.otf'} onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="media-file" /></label>
          {kind === 'font' && <><label>Family name <input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="e.g. Acme Display" data-testid="media-family" /></label>
            <label>Weight <select value={weight} onChange={(e) => setWeight(Number(e.target.value))}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w}>{w}</option>)}</select></label></>}
        </div>
        <LicenseForm value={license} onChange={setLicense} idPrefix="new" />
        <p className="muted small">Declare the licence honestly: bundles only ship files whose licence permits redistribution, and always ship the licence text and attribution alongside them.{kind === 'font' ? ' Font files are only embedded when you tick a redistributable licence; otherwise the font is referenced by name with a fallback stack.' : ''}</p>
        <button className="btn primary" disabled={!file || busy} onClick={() => void add()} data-testid="media-add">{busy ? 'Adding…' : 'Add to library'}</button>
      </section>

      <section className="card">
        <h3>Library files <span className="count">{items.length}</span></h3>
        <ul className="media-list" data-testid="media-list">
          {items.map((m) => <MediaCard key={m.id} m={m} />)}
          {!items.length && <li className="muted">No images or audio yet.</li>}
        </ul>
      </section>

      <section className="card">
        <h3>Imported fonts <span className="count">{Object.keys(project.fonts).length}</span></h3>
        <ul className="media-list" data-testid="font-list">
          {Object.values(project.fonts).map((f) => {
            const used = usageOf(project, '', [f.id]);
            return (
              <li key={f.id} className="media-card">
                <div><b style={{ fontFamily: `"${f.family}", ${f.fallback}` }}>{f.label}</b> <span className="muted small">{f.files.map((x) => x.weight).join(', ')} · {f.license.name}</span></div>
                <div className={`small ${f.license.redistributable ? 'ok-text' : 'warn-text'}`}>{f.license.redistributable ? '✓ embedded in bundles' : '⚠ referenced by name only; the host must supply it'}</div>
                {used.length > 0 && <div className="muted small">Used by {used.join(', ')}</div>}
                <ConfirmButton label="Remove" disabled={used.length > 0} title={used.length ? 'In use' : undefined} onConfirm={() => { commit('Remove font', (p) => { let n = removeUserFont(p, f.id); for (const x of f.files) if (!Object.values(n.fonts).some((o) => o.files.some((y) => y.mediaId === x.mediaId))) n = removeMedia(n, x.mediaId); return n; }); }} />
              </li>
            );
          })}
          {!Object.keys(project.fonts).length && <li className="muted">No imported fonts. Built-in fonts below need no import.</li>}
        </ul>
        <span className="hidden">{fontMediaIds.size}</span>
      </section>

      <section className="card">
        <h3>Built in</h3>
        <ul className="media-list builtin">
          {BUILTIN_FONTS.map((f) => <li key={f.id} className="media-card"><b style={{ fontFamily: `"${f.family}", ${f.fallback}` }}>{f.label}</b> <span className="muted small">{f.files.map((x) => x.weight).join(', ')} · {f.license.id} · {f.license.attribution}</span><span className="small ok-text">✓ redistributable · licence text shipped</span></li>)}
          {Object.entries(BUILTIN_SPRITES).map(([id, s]) => <li key={id} className="media-card"><img alt={s.name} width={28} height={28} src={`data:image/svg+xml;utf8,${encodeURIComponent(s.svg)}`} /> <b>{s.name}</b> <span className="muted small">{id} · {BUILTIN_LICENSE.id}</span></li>)}
        </ul>
      </section>
    </div>
  );
}

function MediaCard({ m }: { m: MediaItem }) {
  const project = useProject();
  const studio = useStudio();
  const commit = useCommit();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const used = usageOf(project, m.id);
  const toggle = async () => {
    setOpen(!open);
    if (!url) { const b = await studio.blobs.get(m.hash); if (b) setUrl(URL.createObjectURL(new Blob([b.slice().buffer as ArrayBuffer], { type: m.mime }))); }
  };
  return (
    <li className="media-card" data-testid={`media-${m.id}`}>
      <div className="mc-head">
        <b>{m.name}</b> <span className="pill">{m.kind}</span> <span className="muted small">{(m.size / 1024).toFixed(1)} KB · {m.hash.slice(0, 8)}</span>
        <span className={`pill ${m.license.redistributable ? 'ok' : 'warn'}`} title={m.license.name}>{m.license.redistributable ? `✓ ${m.license.id}` : 'not bundled'}</span>
      </div>
      {used.length > 0 && <div className="muted small">Used by {used.join(', ')}</div>}
      <div className="mc-actions">
        <button className="btn small" onClick={() => void toggle()}>{open ? 'Hide' : 'Preview / licence'}</button>
        <ConfirmButton label="Delete" disabled={used.length > 0} title={used.length ? 'Still referenced; clear the reference first' : undefined} onConfirm={() => commit('Delete file', (p) => removeMedia(p, m.id))} />
      </div>
      {open && (
        <div className="mc-body">
          {m.kind === 'image' && url && <img src={url} alt={m.name} className="mc-img" />}
          {m.kind === 'audio' && url && <audio controls src={url} />}
          <LicenseForm value={m.license} onChange={(l) => commit('Edit licence', (p) => updateMedia(p, m.id, { license: l }), `lic:${m.id}`)} idPrefix={`m-${m.id}`} />
        </div>
      )}
    </li>
  );
}
