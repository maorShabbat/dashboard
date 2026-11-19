import { useRef, useState } from 'react';
import { copyForAi } from '../../model/copyForAi';
import { presetRef, categoryDef } from '../../model/preset';
import { buildPresetFile, toB64, type EmbeddedAsset } from '../../model/serialize';
import { buildFontManifest } from '../../fonts/manifest';
import { sceneFonts } from '../../model/scene';
import { buildBundle } from '../../export/bundle';
import { importFile } from '../../export/importFile';
import { Btn, Field, Section } from './widgets';
import { useServices, useStore } from './services';
import type { PreviewController } from '../controller';

interface ClaudeDownloads { save(r: { filename: string; data: Blob }): Promise<unknown> }

/** Save a file. Inside a Claude artifact the page may not start downloads itself: it offers the file through the host, and the viewer confirms. */
async function download(name: string, blob: Blob): Promise<'saved' | 'declined'> {
  const host = (window as unknown as { claude?: { use?(n: string): Promise<ClaudeDownloads | null> } }).claude;
  if (host?.use) {
    const d = await host.use('downloads').catch(() => null);
    if (d) {
      try { await d.save({ filename: name, data: blob }); return 'saved'; }
      catch (e) { if ((e as { code?: string }).code === 'declined') return 'declined'; throw new Error(`Could not save ${name}: ${(e as Error).message ?? 'the host refused the download'}`); }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}

export function ExportPanel({ controller, onOpenPreset }: { controller: PreviewController | null; onOpenPreset: (id: string, version: number) => void }) {
  const store = useStore();
  const { fonts, images, runtimeSource } = useServices();
  const doc = store.doc!;
  const file = useRef<HTMLInputElement>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const modified = store.isModified();
  const cur = store.currentPreset()!;
  const fontList = buildFontManifest(sceneFonts(doc.scene), { customs: (id) => fonts.customMeta(id) }).fonts;

  /** Exports need a stable id and version, so unsaved changes are saved first (as your preset, or its next version). */
  const stable = () => {
    if (!modified) return store.currentPreset()!;
    const p = doc.saved ? store.saveVersion() : store.saveAsNew();
    return p!;
  };

  const doCopy = async () => {
    const p = stable();
    const md = copyForAi(p, { customs: (id) => fonts.customMeta(id), duration: controller?.duration });
    setAiText(md);
    try { await navigator.clipboard.writeText(md); store.say(`Copied the reference for ${presetRef(p)} to the clipboard.`, 'ok'); } catch { store.say('Your browser blocked the clipboard. The text is shown below: select it and copy.', 'info'); }
  };
  const embeddedFor = async (p: typeof cur): Promise<Record<string, EmbeddedAsset>> => {
    const out: Record<string, EmbeddedAsset> = {};
    for (const a of p.scene.assets) { const rec = await images.storeRef().get(a.id); if (rec) out[a.id] = { type: rec.type, base64: toB64(new Uint8Array(await rec.blob.arrayBuffer())) }; }
    return out;
  };
  const doJson = async () => {
    setBusy('json');
    try {
      const p = stable();
      const text = JSON.stringify(buildPresetFile(p, { customs: (id) => fonts.customMeta(id), embedded: await embeddedFor(p) }), null, 2);
      const r = await download(`${p.id}@${p.version}.json`, new Blob([text], { type: 'application/json' }));
      store.say(r === 'saved' ? `Exported ${presetRef(p)} as JSON.` : 'Not saved.', r === 'saved' ? 'ok' : 'info');
    } catch (e) { store.say((e as Error).message, 'error'); } finally { setBusy(null); }
  };
  const doBundle = async () => {
    setBusy('bundle'); setProblems([]);
    try {
      const p = stable();
      const b = await buildBundle(p, { fonts, images, runtimeSource: await runtimeSource() });
      const r = await download(`${b.slug}-v${p.version}.zip`, new Blob([b.zip.slice().buffer], { type: 'application/zip' }));
      setProblems(b.warnings);
      store.say(r === 'saved' ? `Bundle for ${presetRef(p)}: ${b.files.length} files, ${(b.zip.length / 1024).toFixed(0)} KiB, only the fonts it uses.` : 'Not saved.', r === 'saved' ? 'ok' : 'info');
    } catch (e) { store.say((e as Error).message, 'error'); } finally { setBusy(null); }
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    const r = await importFile(f, { fonts, images });
    if (!r.ok) { setProblems(r.errors); store.say(`Could not import ${f.name}.`, 'error'); return; }
    const p = store.adopt(r.preset!);
    setProblems(r.warnings);
    store.say(`Imported ${presetRef(p)} into My presets.`, 'ok');
    onOpenPreset(p.id, p.version);
  };

  return (
    <div className="panel-body" data-testid="export-panel">
      <Section title="This effect" open testId="identity">
        <Field label="Name"><input className="inp" value={doc.name} onChange={(e) => store.rename(e.target.value)} data-testid="preset-name" /></Field>
        <Field label="Description"><textarea className="inp" value={doc.description} onChange={(e) => store.setDescription(e.target.value)} rows={2} /></Field>
        <div className="note" data-testid="preset-identity">
          <b>{presetRef(cur)}</b> · {categoryDef(doc.category).name}<br />
          {doc.saved ? <>Your preset. {store.versionsOf(doc.saved.id).length} version{store.versionsOf(doc.saved.id).length === 1 ? '' : 's'} saved.{modified && ' You have unsaved changes.'}</> : modified ? <>A changed copy of the built-in {doc.base.id}@{doc.base.version}. The original is untouched; save it as yours to keep it.</> : <>The built-in preset, unchanged. Built-in presets never change.</>}
        </div>
        <div className="row wrap">
          <Btn primary onClick={() => { if (doc.saved) store.saveVersion(); else store.saveAsNew(); }} disabled={!modified && !!doc.saved} testId="save-version">{doc.saved ? 'Save (new version)' : 'Save as my preset'}</Btn>
          {doc.saved && <Btn onClick={() => store.saveAsNew(`${doc.name} copy`)} testId="save-as-new">Save as a new preset</Btn>}
          {!doc.saved && modified && <Btn ghost onClick={() => store.reset()} testId="reset-preset">Reset to the original</Btn>}
          {doc.saved && <Btn danger onClick={() => { store.deleteUser(doc.saved!.id); store.say('Deleted.', 'info'); }} testId="delete-preset">Delete</Btn>}
        </div>
        {doc.saved && store.versionsOf(doc.saved.id).length > 1 && (
          <Field label="Earlier versions"><div className="chips">{store.versionsOf(doc.saved.id).slice().reverse().map((v) => <button type="button" key={v.version} className="chip" aria-pressed={v.version === doc.saved!.version} onClick={() => onOpenPreset(v.id, v.version)}>v{v.version} · {v.created}</button>)}</div></Field>
        )}
      </Section>

      <Section title="Use it in your game" open testId="export-section">
        <div className="note">Exporting always uses a stable id and version. If you changed something, it is saved as your preset first.</div>
        <Btn primary onClick={() => void doCopy()} testId="copy-ai">Copy for AI Coding</Btn>
        <div className="hint" style={{ color: 'var(--muted)' }}>A precise description built from the settings you have right now: fonts and licences, every number, every effect setting, timing, and the exact JSON.</div>
        {aiText && <textarea className="codebox" readOnly value={aiText} rows={10} data-testid="ai-text" onFocus={(e) => e.target.select()} style={{ width: '100%', resize: 'vertical' }} />}
        <div className="row wrap">
          <Btn onClick={() => void doJson()} disabled={busy !== null} testId="export-json">{busy === 'json' ? 'Working…' : 'Download preset (.json)'}</Btn>
          <Btn onClick={() => void doBundle()} disabled={busy !== null} testId="export-bundle">{busy === 'bundle' ? 'Building…' : 'Download bundle (.zip)'}</Btn>
        </div>
        <div className="hint" style={{ color: 'var(--muted)' }}>The bundle holds the preset, the player, your images, ONLY the fonts used (with licence files and a licence manifest) and runs offline.</div>
        <input ref={file} type="file" hidden accept=".json,.zip,application/json,application/zip" data-testid="import-file" onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
        <Btn onClick={() => file.current?.click()} testId="import-btn">Import a preset or bundle…</Btn>
        {problems.length > 0 && <div className="note warn" role="alert" data-testid="export-problems">{problems.map((p, i) => <div key={i}>{p}</div>)}</div>}
      </Section>

      <Section title="Fonts used and their licences" open={fontList.length > 0} hint={`${fontList.length}`} testId="licences">
        {fontList.length === 0 && <div className="hint">No fonts are used.</div>}
        {fontList.map((f) => (
          <div key={f.id} className="lic">
            <b style={{ color: 'var(--text)' }}>{f.family}</b>
            <span>{f.userSupplied ? 'Uploaded by you: you are responsible for the licence.' : `${f.licenseId} · ${f.redistributionPermitted ? 'redistribution permitted' : 'check licence'} · weights ${f.includedWeights.join(', ')} · checked ${f.dateChecked}`}</span>
            {!f.userSupplied && <span><a href={f.sourceUrl} target="_blank" rel="noreferrer">{f.sourceUrl.replace('https://', '')}</a></span>}
          </div>
        ))}
      </Section>
    </div>
  );
}
