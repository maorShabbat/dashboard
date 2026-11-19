import { useState, type ReactNode } from 'react';
import { type DiffEntry, jsonDiff, showValue } from '../../core/model/diff';
import { approveVersion, contentHash, deleteAsset, deleteVersion, describeAsset, duplicateAsset, duplicateTheme, getAsset, isDirty, latestVersion, renameAsset, restoreVersion, revokeApproval, saveVersion, toggleFavourite } from '../../core/model/ops';
import type { AssetKind, LibraryAsset, ThemeContent } from '../../core/model/types';
import { setToken } from '../../core/model/edit';
import { useCommit, useProject, useStudio } from '../studio';

export function ConfirmButton({ label, confirmLabel = 'Confirm?', onConfirm, className = 'btn small danger', testId, title, disabled }: { label: ReactNode; confirmLabel?: string; onConfirm(): void; className?: string; testId?: string; title?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className={className} data-testid={testId} title={title} disabled={disabled} onBlur={() => setArmed(false)} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : label}
    </button>
  );
}

const KIND_LABEL: Record<AssetKind, string> = { theme: 'theme', preset: 'preset', sequence: 'sequence' };

export function dirtyBadge(a: LibraryAsset<unknown>): ReactNode {
  const last = latestVersion(a);
  const ap = a.versions.find((v) => v.id === a.approvedVersionId);
  return (
    <>
      {ap && <span className="pill ok" title={`Approved version ${ap.label}`}>✓ {ap.label}</span>}
      {isDirty(a) ? <span className="pill warn" title="Draft differs from the last saved version">unsaved</span> : last && last.id !== ap?.id && <span className="pill" title="Draft equals the last saved version">{last.label}</span>}
    </>
  );
}

interface HeaderProps { kind: AssetKind; id: string; onDeleted(): void; onDuplicated(id: string): void; children?: ReactNode }

export function AssetHeader({ kind, id, onDeleted, onDuplicated, children }: HeaderProps) {
  const project = useProject();
  const commit = useCommit();
  const a = getAsset(project, kind, id);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  if (!a) return null;
  const doRename = () => { if (name.trim()) commit(`Rename ${KIND_LABEL[kind]}`, (p) => renameAsset(p, kind, id, name)); setRenaming(false); };
  return (
    <header className="asset-header" data-testid={`${kind}-header`}>
      <div className="asset-title">
        <button className={`icon-btn star ${a.favourite ? 'on' : ''}`} title={a.favourite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={a.favourite} data-testid="btn-favourite"
          onClick={() => commit('Toggle favourite', (p) => toggleFavourite(p, kind, id))}>{a.favourite ? '★' : '☆'}</button>
        {renaming
          ? <input autoFocus className="title-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={doRename} onKeyDown={(e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenaming(false); }} aria-label="Name" data-testid="name-input" />
          : <h2 data-testid="asset-name" onDoubleClick={() => { setName(a.name); setRenaming(true); }}>{a.name}</h2>}
        <button className="icon-btn" title="Rename" aria-label="Rename" data-testid="btn-rename" onClick={() => { setName(a.name); setRenaming(true); }}>✎</button>
        {dirtyBadge(a)}
        {a.derivedFrom && <span className="muted small" title="Duplicated from">from “{a.derivedFrom.name}”</span>}
      </div>
      <div className="asset-actions">
        {children}
        <button className="btn small" data-testid="btn-duplicate" title={kind === 'theme' ? 'Duplicate the theme together with its presets and sequences' : 'Duplicate'} onClick={() => {
          let newId = '';
          commit(`Duplicate ${KIND_LABEL[kind]}`, (p) => { const r = kind === 'theme' ? duplicateTheme(p, id) : duplicateAsset(p, kind, id); newId = r.id; return r.project; });
          if (newId) onDuplicated(newId);
        }}>⧉ Duplicate</button>
        <ConfirmButton label="Delete" testId="btn-delete" onConfirm={() => { commit(`Delete ${KIND_LABEL[kind]}`, (p) => deleteAsset(p, kind, id).project); onDeleted(); }}
          title={kind === 'theme' ? 'Presets linked to this theme become independent snapshots' : undefined} />
      </div>
    </header>
  );
}

export function DescriptionBox({ kind, id, docOnly }: { kind: AssetKind; id: string; docOnly?: boolean }) {
  const project = useProject();
  const commit = useCommit();
  const a = getAsset(project, kind, id);
  if (!a) return null;
  return (
    <div className="description-box">
      <label className="field-label" htmlFor={`${kind}-desc`}>Description {docOnly && <span className="pill doc" data-testid="doc-only-pill">documentation only</span>}</label>
      <textarea id={`${kind}-desc`} rows={2} value={a.description} placeholder={`Describe this ${kind}…`} data-testid="description"
        onChange={(e) => commit('Edit description', (p) => describeAsset(p, kind, id, e.target.value), `desc:${id}`)} />
      {docOnly && <p className="muted small">Describes art direction for people. The renderer never reads it: every visual comes from the explicit parameters below, so editing text cannot change how anything looks.</p>}
    </div>
  );
}

export function DiffList({ diffs }: { diffs: DiffEntry[] }) {
  if (!diffs.length) return <p className="muted small">No differences.</p>;
  return (
    <ul className="diff-list" data-testid="diff-list">
      {diffs.slice(0, 60).map((d) => <li key={d.path}><code>{d.path}</code><span className="before">{showValue(d.before)}</span>→<span className="after">{showValue(d.after)}</span></li>)}
      {diffs.length > 60 && <li className="muted">…and {diffs.length - 60} more</li>}
    </ul>
  );
}

export function VersionsPanel({ kind, id }: { kind: AssetKind; id: string }) {
  const project = useProject();
  const commit = useCommit();
  const studio = useStudio();
  const a = getAsset<unknown>(project, kind, id);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [compare, setCompare] = useState<string | null>(null);
  const [approver, setApprover] = useState(() => { try { return localStorage.getItem('bangers.approver') ?? ''; } catch { return ''; } });
  if (!a) return null;
  const dirty = isDirty(a);
  const versions = [...a.versions].reverse();
  void studio;
  return (
    <div className="versions" data-testid="versions-panel">
      <div className="save-row">
        <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Version label" data-testid="version-label" />
        <input placeholder="What changed?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Version note" data-testid="version-note" />
        <button className="btn primary" disabled={!dirty} data-testid="btn-save-version" onClick={() => { commit(`Save ${KIND_LABEL[kind]} version`, (p) => saveVersion(p, kind, id, { label, note }).project); setLabel(''); setNote(''); }}>
          Save version
        </button>
      </div>
      <p className="muted small">{dirty ? 'The working draft has changes that are not in any saved version.' : 'The working draft matches the latest saved version.'} Versions are immutable snapshots; restoring one replaces the draft (undoable).</p>
      <label className="check small"><span>Approver</span> <input value={approver} placeholder="your name" onChange={(e) => { setApprover(e.target.value); try { localStorage.setItem('bangers.approver', e.target.value); } catch { /* ignore */ } }} data-testid="approver" /></label>
      <ul className="version-list">
        {versions.map((v) => {
          const isApproved = a.approvedVersionId === v.id;
          const diffs = compare === v.id ? jsonDiff(v.content, a.draft) : null;
          return (
            <li key={v.id} className={isApproved ? 'approved' : ''} data-testid={`version-${v.number}`}>
              <div className="v-head">
                <strong>v{v.number}</strong> <span>{v.label !== `v${v.number}` ? v.label : ''}</span>
                {isApproved && <span className="pill ok" data-testid="approved-pill">✓ approved{v.approval.by ? ` by ${v.approval.by}` : ''}</span>}
                {!isApproved && v.approval.status === 'approved' && <span className="pill">previously approved</span>}
                {v.approval.status === 'revoked' && <span className="pill warn">approval revoked</span>}
                <span className="muted small">{new Date(v.createdAt).toLocaleString()}</span>
              </div>
              {v.note && <div className="muted small">{v.note}</div>}
              <div className="v-actions">
                {isApproved
                  ? <button className="btn small" onClick={() => commit('Revoke approval', (p) => revokeApproval(p, kind, id, v.id))}>Revoke approval</button>
                  : <button className="btn small" data-testid={`approve-${v.number}`} onClick={() => commit('Approve version', (p) => approveVersion(p, kind, id, v.id, { by: approver || 'unknown' }))}>✓ Approve</button>}
                <button className="btn small" onClick={() => commit('Restore version', (p) => restoreVersion(p, kind, id, v.id))} data-testid={`restore-${v.number}`}>Restore to draft</button>
                <button className="btn small" onClick={() => setCompare(compare === v.id ? null : v.id)}>{compare === v.id ? 'Hide diff' : 'Compare with draft'}</button>
                <ConfirmButton label="Delete" disabled={isApproved} title={isApproved ? "Revoke approval before deleting" : undefined} onConfirm={() => commit('Delete version', (p) => deleteVersion(p, kind, id, v.id))} />
              </div>
              {diffs && <DiffList diffs={diffs} />}
            </li>
          );
        })}
        {!versions.length && <li className="muted">No versions yet. Save one to snapshot the draft.</li>}
      </ul>
      <p className="muted small">Hash of draft: <code>{contentHash(a.draft).slice(0, 12)}</code></p>
    </div>
  );
}

export function ArtDirection({ id }: { id: string }) {
  const project = useProject();
  const commit = useCommit();
  const theme = project.themes[id];
  if (!theme) return null;
  const ad = theme.draft.artDirection;
  const upd = (patch: Partial<ThemeContent['artDirection']>, key: string) => commit('Edit art direction', (p) => ({ ...p, themes: { ...p.themes, [id]: { ...p.themes[id]!, updatedAt: new Date().toISOString(), draft: { ...p.themes[id]!.draft, artDirection: { ...p.themes[id]!.draft.artDirection, ...patch } } } } }), `ad:${id}:${key}`);
  return (
    <details className="art-direction" data-testid="art-direction">
      <summary>Art direction <span className="pill doc">documentation only</span></summary>
      <label className="field-label">Summary<textarea rows={3} value={ad.summary} onChange={(e) => upd({ summary: e.target.value }, 'summary')} data-testid="ad-summary" /></label>
      <label className="field-label">Mood words (comma separated)<input value={ad.mood.join(', ')} onChange={(e) => upd({ mood: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }, 'mood')} /></label>
      <label className="field-label">References<textarea rows={2} value={ad.references} onChange={(e) => upd({ references: e.target.value }, 'refs')} /></label>
      <div className="two"><label className="field-label">Do<textarea rows={2} value={ad.dos} onChange={(e) => upd({ dos: e.target.value }, 'dos')} /></label>
        <label className="field-label">Don't<textarea rows={2} value={ad.donts} onChange={(e) => upd({ donts: e.target.value }, 'donts')} /></label></div>
      <label className="field-label">Game<input value={theme.draft.game} onChange={(e) => commit('Edit game name', (p) => ({ ...p, themes: { ...p.themes, [id]: { ...p.themes[id]!, draft: { ...p.themes[id]!.draft, game: e.target.value } } } }), `game:${id}`)} /></label>
      <p className="muted small">These notes travel with the theme and appear in bundle READMEs, but nothing here is interpreted by the renderer.</p>
    </details>
  );
}

export { setToken };
