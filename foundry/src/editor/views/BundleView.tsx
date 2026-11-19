import { useMemo, useRef, useState } from 'react';
import runtimeSource from '../../../generated/bangers-runtime.js?raw';
import runtimeDts from '../../runtime/runtime.d.ts?raw';
import { exportBundle, ExportError, type ExportResult } from '../../core/bundle/export';
import { importBundle } from '../../core/bundle/import';
import { verifyBundle, type VerifyReport } from '../../core/bundle/verify';
import { exportThemePackage, sanitizeProject } from '../../core/model/exchange';
import { collectPresetRefs, collectSequenceRefs, collectThemeRefs, mergeRefs, newRefs } from '../../core/model/refs';
import type { Project } from '../../core/model/types';
import { createStarterProject } from '../../core/starter';
import { ConfirmButton } from '../components/AssetChrome';
import { builtinFontFile, registerUserFonts } from '../fonts';
import { useCommit, useProject, useStudio, useUi } from '../studio';
import { EmptyState } from './ThemeView';

/**
 * Save a file. Inside the claude.ai artifact viewer the sandbox blocks ordinary downloads, so use its `downloads`
 * capability when present (the viewer confirms the save); everywhere else use a normal browser download.
 */
async function saveFile(name: string, data: BlobPart, type: string, notify?: (msg: string, kind: 'ok' | 'warn' | 'error') => void): Promise<void> {
  const blob = new Blob([data], { type });
  const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save(r: { filename: string; data: Blob }): Promise<{ status: string }> } | null> } }).claude;
  if (typeof claude?.use === 'function') {
    try {
      const d = await claude.use('downloads');
      if (d) {
        await d.save({ filename: name, data: blob });
        notify?.(`Saved ${name}`, 'ok');
        return;
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') { notify?.('Save cancelled', 'warn'); return; }
      if (code !== 'unavailable' && code !== 'not_granted') { notify?.(`Could not save ${name}: ${(e as { message?: string }).message ?? code}`, 'error'); return; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const fmt = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);

export function VerifyReportView({ report, testId }: { report: VerifyReport; testId: string }) {
  const passed = report.checks.filter((c) => c.status === 'pass').length;
  const failed = report.checks.filter((c) => c.status === 'fail').length;
  const warned = report.checks.filter((c) => c.status === 'warn').length;
  return (
    <div className="verify" data-testid={testId}>
      <div className={`verify-overall ${report.ok ? 'ok' : 'fail'}`} data-testid="verify-overall" data-ok={report.ok}>
        {report.ok ? '✔ Verified' : '✘ Verification failed'} <span className="muted">{passed} passed · {warned} warning(s) · {failed} failed</span>
      </div>
      <ul className="checks">
        {report.checks.map((c) => (
          <li key={c.id} className={`check-${c.status}`} data-testid={`verify-check-${c.id}`} data-status={c.status}>
            <span className="ic">{c.status === 'pass' ? '✔' : c.status === 'warn' ? '!' : '✘'}</span>
            <div><b>{c.label}</b><div className="muted small">{c.detail}</div>
              {c.items && <ul className="items">{c.items.map((i, k) => <li key={k}>{i}</li>)}</ul>}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function collectBlobs(p: Project, studio: ReturnType<typeof useStudio>): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const m of Object.values(p.media)) { const b = await studio.blobs.get(m.hash); if (b) out.set(m.hash, b); }
  return out;
}

export function BundleView() {
  const project = useProject();
  const ui = useUi();
  const studio = useStudio();
  const commit = useCommit();
  const theme = ui.themeId ? project.themes[ui.themeId] : undefined;
  const [source, setSource] = useState<'approved' | 'draft'>('approved');
  const [requireApproved, setRequireApproved] = useState(false);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<{ name: string; bytes: Uint8Array; report: VerifyReport } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const seqs = useMemo(() => Object.values(project.sequences).filter((s) => s.draft.themeId === theme?.id), [project.sequences, theme?.id]);
  if (!theme) return <EmptyState what="theme" />;
  const approved = theme.versions.find((v) => v.id === theme.approvedVersionId);

  const build = async () => {
    setBusy(true); setError(null); setResult(null); setReport(null);
    try {
      const env = { project: studio.store.state, blob: (h: string) => studio.blobs.get(h), builtinFontFile, runtimeSource, runtimeDts };
      const res = await exportBundle(env, { themeId: theme.id, source, requireApproved, sequenceIds: seqs.filter((s) => !deselected.has(s.id)).map((s) => s.id), ...(name.trim() ? { name: name.trim() } : {}) });
      setResult(res);
      setReport(await verifyBundle(res.bytes));
    } catch (e) { setError(e instanceof ExportError ? e.message : `Export failed: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  const fileName = (r: ExportResult) => `${r.manifest.theme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.manifest.theme.version?.label ?? r.manifest.theme.source}.bangers-bundle.zip`;

  const onImportFile = async (f: File) => {
    setBusy(true); setError(null);
    try { const bytes = new Uint8Array(await f.arrayBuffer()); setImported({ name: f.name, bytes, report: await verifyBundle(bytes) }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const doImport = async () => {
    if (!imported) return;
    try {
      const r = await importBundle(studio.store.state, imported.bytes);
      for (const bytes of r.blobs.values()) await studio.blobs.put(bytes);
      commit('Import bundle', () => r.project);
      await registerUserFonts(r.project, studio.blobs);
      await studio.media.sync(r.project);
      studio.ui.set({ themeId: r.themeId, tab: 'theme' });
      studio.toasts.push(`Imported bundle as “${r.project.themes[r.themeId]!.name}”`, r.warnings.length ? 'warn' : 'ok', r.warnings);
      setImported(null);
    } catch (e) { studio.toasts.push(`Import failed: ${(e as Error).message}`, 'error'); }
  };

  const exportThemeFile = async () => {
    const blobs = await collectBlobs(studio.store.state, studio);
    const pkg = exportThemePackage(studio.store.state, theme.id, (h) => blobs.get(h));
    await saveFile(`${theme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.bangers-theme.json`, JSON.stringify(pkg, null, 2), 'application/json', (m, k) => studio.toasts.push(m, k));
  };

  const refs = (() => { const r = mergeRefs(newRefs(), collectThemeRefs(theme.draft)); return { assets: r.assets.size, fonts: r.fonts.size }; })();
  void collectPresetRefs; void collectSequenceRefs;

  return (
    <div className="view bundle-view" data-testid="bundle-view">
      <section className="card" data-testid="export-card">
        <h3>Export a portable bundle</h3>
        <p className="muted">A ZIP with the configuration, referenced assets, <strong>permitted</strong> font files, licences, schema/package versions, the runtime and working examples. It is verified straight after building by importing it into a fresh project and replaying it.</p>
        <div className="form-grid">
          <label>Theme <input value={theme.name} readOnly /></label>
          <label>Bundle name <input value={name} placeholder={`${theme.name} bundle`} onChange={(e) => setName(e.target.value)} data-testid="bundle-name" /></label>
        </div>
        <fieldset>
          <legend>Content source</legend>
          <label className="check"><input type="radio" name="src" checked={source === 'approved'} onChange={() => setSource('approved')} data-testid="src-approved" /> Approved versions {approved ? <span className="pill ok">✓ {approved.label}</span> : <span className="pill warn">none approved: drafts will be used</span>}</label>
          <label className="check"><input type="radio" name="src" checked={source === 'draft'} onChange={() => setSource('draft')} data-testid="src-draft" /> Working drafts <span className="muted small">(for testing; not a release)</span></label>
          <label className="check"><input type="checkbox" checked={requireApproved} onChange={(e) => setRequireApproved(e.target.checked)} data-testid="require-approved" /> Require every included asset to have an approved version (release mode)</label>
        </fieldset>
        <fieldset>
          <legend>Sequences ({seqs.length - deselected.size} of {seqs.length})</legend>
          {seqs.map((s) => <label key={s.id} className="check"><input type="checkbox" checked={!deselected.has(s.id)} onChange={(e) => { const n = new Set(deselected); if (e.target.checked) n.delete(s.id); else n.add(s.id); setDeselected(n); }} /> {s.name}</label>)}
          {!seqs.length && <p className="muted small">This theme has no sequences; presets and the 12 effects are still included and verified.</p>}
        </fieldset>
        <p className="muted small">References {refs.assets} asset(s) and {refs.fonts} font(s) in the theme itself. Presets and sequences may add more.</p>
        <button className="btn primary big" onClick={() => void build()} disabled={busy} data-testid="export-build">{busy ? 'Building & verifying…' : 'Build & verify bundle'}</button>
        {error && <p className="error" data-testid="export-error">{error}</p>}
        {result && report && (
          <div className="export-result" data-testid="export-result">
            <div className="summary-grid">
              <div><b>{result.entries.length}</b><span>files</span></div><div><b>{fmt(result.bytes.length)}</b><span>zip size</span></div>
              <div><b>{result.manifest.media.length}</b><span>assets</span></div><div><b>{result.manifest.fonts.filter((f) => f.bundled).length}</b><span>fonts bundled</span></div>
              <div><b>{result.manifest.licenses.length}</b><span>licences</span></div><div><b>{result.manifest.omitted.length}</b><span>omitted</span></div>
            </div>
            <p className="muted small">Bundle layout v{result.manifest.bundleVersion} · data schema v{result.manifest.schemaVersion} · studio {result.manifest.packageVersion} · runtime {result.manifest.runtimeVersion} · theme from {result.manifest.theme.source}{result.manifest.theme.approved ? ` (approved ${result.manifest.theme.version?.label})` : ' (not approved)'}</p>
            {result.warnings.length > 0 && <div className="warn-box" data-testid="export-warnings"><b>Warnings</b><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
            {result.manifest.omitted.length > 0 && <div className="warn-box" data-testid="export-omitted"><b>Not included (licence or availability)</b><ul>{result.manifest.omitted.map((o) => <li key={o.id}><b>{o.kind} {o.name}</b>: {o.reason}</li>)}</ul></div>}
            <details><summary>Files</summary><table className="files"><tbody>{result.manifest.files.map((f) => <tr key={f.path}><td>{f.path}</td><td>{fmt(f.size)}</td><td><code>{f.sha256.slice(0, 10)}</code></td></tr>)}</tbody></table></details>
            <VerifyReportView report={report} testId="export-verify" />
            <button className="btn primary" onClick={() => void saveFile(fileName(result), result.bytes as unknown as BlobPart, 'application/zip', (m, k) => studio.toasts.push(m, k))} disabled={!report.ok} data-testid="export-download" title={report.ok ? '' : 'Fix the failed checks first'}>⬇ Download {fileName(result)}</button>
          </div>
        )}
      </section>

      <section className="card" data-testid="import-card">
        <h3>Verify or import a bundle</h3>
        <p className="muted">Pick a bundle ZIP. It is checked (checksums, licences, fonts, schema), imported into a scratch project and replayed through both the studio and its own runtime before you can bring it into this project.</p>
        <input ref={inputRef} type="file" accept=".zip,application/zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); e.target.value = ''; }} data-testid="import-bundle-input" />
        {imported && (
          <div data-testid="import-result">
            <h4>{imported.name}</h4>
            <VerifyReportView report={imported.report} testId="import-verify" />
            <button className="btn primary" onClick={() => void doImport()} disabled={!imported.report.ok} data-testid="import-confirm" title="Adds the bundle as a new theme with its presets and sequences">Import into this project</button>
          </div>
        )}
      </section>

      <section className="card" data-testid="files-card">
        <h3>Theme files &amp; backups</h3>
        <div className="seg-row wrap">
          <button className="btn" onClick={() => void exportThemeFile()} data-testid="export-theme-file">⬇ Theme file (.bangers-theme.json)</button>
          <button className="btn" onClick={() => void saveFile('bangers-project-backup.json', JSON.stringify(studio.store.state, null, 2), 'application/json', (m, k) => studio.toasts.push(m, k))} data-testid="export-project">⬇ Project backup (JSON)</button>
          <button className="btn" onClick={() => restoreRef.current?.click()}>⤒ Restore backup…</button>
          <input ref={restoreRef} type="file" accept=".json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try { const r = sanitizeProject(JSON.parse(await f.text())); commit('Restore backup', () => r.project); studio.ui.set({ themeId: Object.keys(r.project.themes)[0] ?? null }); studio.toasts.push('Backup restored', r.warnings.length ? 'warn' : 'ok', r.warnings); }
            catch (err) { studio.toasts.push(`Could not restore: ${(err as Error).message}`, 'error'); }
          }} />
          <ConfirmButton label="Reset to starter library" confirmLabel="Really replace everything?" onConfirm={() => { const p = createStarterProject(); commit('Reset library', () => p); studio.ui.set({ themeId: Object.keys(p.themes)[0] ?? null, presetId: null, sequenceId: null }); }} />
        </div>
        <p className="muted small">Theme files carry one theme with its version history, presets, sequences and media (base64). Project backups hold the library metadata only; media files stay in this browser's storage. Everything here is undoable except downloads.</p>
      </section>
    </div>
  );
}
