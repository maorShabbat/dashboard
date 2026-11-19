import { describe, expect, it } from 'vitest';
import { createStarterProject, STARTER_IDS as S } from '../src/core/starter';
import {
  approveVersion, createPreset, createTheme, deleteAsset, deleteVersion, describeAsset, detachPresetToSnapshot, duplicateAsset, duplicateTheme, emptyProject, isDirty,
  libraryView, relinkPreset, renameAsset, restoreVersion, revokeApproval, saveVersion, toggleFavourite, updateDraft, contentFor, getAsset,
} from '../src/core/model/ops';
import { setToken, setOverride, updateEffectDefault } from '../src/core/model/edit';
import { ProjectStore } from '../src/core/store/history';
import { compileSequence, evaluateFrame } from '../src/core/engine';
import { frameFingerprint, fingerprintSequence } from '../src/core/fingerprint';
import type { PresetContent, ThemeContent } from '../src/core/model/types';
import { exportThemePackage, importThemePackage, sanitizeProject, bytesToBase64 } from '../src/core/model/exchange';
import { sanitizeTheme, sanitizeSequence } from '../src/core/model/sanitize';
import { sha256Hex } from '../src/core/util/sha256';
import { sha256Hex as _s } from '../src/core/util/sha256';
void _s;

const VP = { viewport: { w: 1280, h: 720 } };

describe('starter library', () => {
  const p = createStarterProject();
  it('compiles every sequence and preset without warnings and with frames of every kind', () => {
    for (const sq of Object.values(p.sequences)) {
      const c = compileSequence(sq.draft, libraryView(p));
      expect(c.warnings, sq.name).toEqual([]);
      expect(c.duration, sq.name).toBeGreaterThan(1000);
      const fp = fingerprintSequence(c, ['desktop', 'mobile']);
      expect(fp.viewports[0]!.samples.length).toBe(9);
      expect(fp.events.count).toBeGreaterThan(0);
    }
  });
  it('has an approved Classic version and a Neon draft that differs visually', () => {
    expect(p.themes[S.classic]!.approvedVersionId).not.toBeNull();
    const seq = p.sequences[S.sequences.bigWin]!.draft;
    const a = evaluateFrame(compileSequence(seq, libraryView(p)), 1500, VP);
    const b = evaluateFrame(compileSequence({ ...seq, themeId: S.neon }, libraryView(p)), 1500, VP);
    expect(frameFingerprint(a)).not.toBe(frameFingerprint(b));
  });
});

describe('asset lifecycle', () => {
  it('create, duplicate (with dependents), rename, describe, favourite', () => {
    let p = createStarterProject();
    const before = Object.keys(p.presets).length;
    const d = duplicateTheme(p, S.classic);
    p = d.project;
    expect(d.copied.presets).toBe(6);
    expect(d.copied.sequences).toBe(3);
    expect(Object.keys(p.presets).length).toBe(before + 6);
    const copy = p.themes[d.id]!;
    expect(copy.name).toBe('BANGERS Classic (copy)');
    expect(copy.versions).toEqual([]); // history is not copied
    expect(copy.derivedFrom?.id).toBe(S.classic);
    // copied sequences use copied presets, linked to the copy
    const seqCopy = Object.values(p.sequences).find((s) => s.draft.themeId === d.id)!;
    const usedPresets = seqCopy.draft.tracks.flatMap((t) => t.clips.map((c) => c.presetId)).filter(Boolean) as string[];
    for (const id of usedPresets) expect(p.presets[id]!.draft.themeId).toBe(d.id);
    p = renameAsset(p, 'theme', d.id, '  Gold Rush ');
    p = describeAsset(p, 'theme', d.id, 'Warm and shiny');
    p = toggleFavourite(p, 'theme', d.id);
    expect(p.themes[d.id]).toMatchObject({ name: 'Gold Rush', description: 'Warm and shiny', favourite: true });
    p = toggleFavourite(p, 'theme', d.id);
    expect(p.themes[d.id]!.favourite).toBe(false);
    const dup = duplicateAsset(p, 'theme', d.id);
    expect(dup.project.themes[dup.id]!.name).toBe('Gold Rush (copy)');
    expect(duplicateAsset(dup.project, 'theme', d.id).project.themes).toBeDefined();
  });

  it('description and art direction never change rendering (they are documentation only)', () => {
    let p = createStarterProject();
    const seq = p.sequences[S.sequences.bigWin]!.draft;
    const fp = () => fingerprintSequence(compileSequence(seq, libraryView(p)), ['desktop']);
    const before = fp();
    p = describeAsset(p, 'theme', S.classic, 'Make everything bright pink and enormous, with lots of sparkles!');
    p = updateDraft<ThemeContent>(p, 'theme', S.classic, (d) => ({ ...d, game: 'Other', artDirection: { ...d.artDirection, summary: 'neon green everything', mood: ['pink', 'huge'] } }));
    expect(fp()).toEqual(before);
    // …whereas an explicit parameter does change it
    p = updateDraft<ThemeContent>(p, 'theme', S.classic, (d) => setToken(d, 'color.win', '#ff00ff'));
    expect(fp()).not.toEqual(before);
  });

  it('delete theme converts linked presets to independent snapshots', () => {
    const p = createStarterProject();
    const { project, detachedPresets } = deleteAsset(p, 'theme', S.neon);
    expect(project.themes[S.neon]).toBeUndefined();
    expect(detachedPresets).toEqual([S.presets.neonPulse]);
    const pr = project.presets[S.presets.neonPulse]!.draft;
    expect(pr.link).toBe('snapshot');
    // the sequence that used it still renders in the Neon look
    const c = compileSequence(project.sequences[S.sequences.neonWin]!.draft, libraryView(project));
    const clipRes = c.clips.find((x) => x.presetId === S.presets.neonPulse)!;
    expect(clipRes.basis).toBe('snapshot');
    expect(clipRes.tokens.values['color.primary']).toBe('#ff2bd6');
  });
});

describe('versions and approvals', () => {
  it('saves immutable versions, tracks dirtiness, restores, approves and revokes', () => {
    let p = createStarterProject();
    const th = () => p.themes[S.neon]!;
    expect(isDirty(th())).toBe(false);
    p = updateDraft<ThemeContent>(p, 'theme', S.neon, (d) => setToken(d, 'color.win', '#abcdef'));
    expect(isDirty(th())).toBe(true);
    const saved = saveVersion(p, 'theme', S.neon, { label: 'Warmer', note: 'tweak' });
    p = saved.project;
    expect(saved.versionId).not.toBeNull();
    expect(th().versions.map((v) => v.number)).toEqual([1, 2]);
    expect(isDirty(th())).toBe(false);
    expect(saveVersion(p, 'theme', S.neon).versionId).toBeNull(); // nothing changed → no empty version
    // versions are snapshots, not references
    p = updateDraft<ThemeContent>(p, 'theme', S.neon, (d) => setToken(d, 'color.win', '#000000'));
    expect(th().versions[1]!.content.tokens['color.win']).toBe('#abcdef');
    // approving
    const v2 = th().versions[1]!;
    p = approveVersion(p, 'theme', S.neon, v2.id, { by: 'Maor', note: 'ship it' });
    expect(th().approvedVersionId).toBe(v2.id);
    expect(th().versions[1]!.approval).toMatchObject({ status: 'approved', by: 'Maor' });
    expect(() => deleteVersion(p, 'theme', S.neon, v2.id)).toThrow(/approved/);
    // "approved" content differs from the draft
    expect(contentFor(th(), 'approved').content.tokens['color.win']).toBe('#abcdef');
    expect(contentFor(th(), 'draft').content.tokens['color.win']).toBe('#000000');
    // restore draft from v1
    p = restoreVersion(p, 'theme', S.neon, th().versions[0]!.id);
    expect(th().draft.tokens['color.win']).toBe('#fff35c');
    p = revokeApproval(p, 'theme', S.neon, v2.id, 'superseded');
    expect(th().approvedVersionId).toBeNull();
    expect(th().versions[1]!.approval.status).toBe('revoked');
    p = deleteVersion(p, 'theme', S.neon, v2.id);
    expect(th().versions.length).toBe(1);
  });

  it('libraryView("approved") resolves against approved content, falling back to draft', () => {
    let p = createStarterProject();
    p = updateDraft<ThemeContent>(p, 'theme', S.classic, (d) => setToken(d, 'color.win', '#123456'));
    expect(libraryView(p, 'draft').theme(S.classic)!.tokens['color.win']).toBe('#123456');
    expect(libraryView(p, 'approved').theme(S.classic)!.tokens['color.win']).toBeUndefined();
    expect(libraryView(p, 'approved').theme(S.neon)!.tokens['color.win']).toBe('#fff35c'); // never approved → draft
  });
});

describe('presets: linked vs snapshot', () => {
  it('linked follows theme edits; snapshot is independent; relink restores following', () => {
    let p = createStarterProject();
    const colour = (presetId: string) => {
      const pr = p.presets[presetId]!.draft;
      const lib = libraryView(p);
      const th = pr.link === 'snapshot' ? pr.snapshot!.content : lib.theme(pr.themeId!)!;
      return compileSequence({ ...p.sequences[S.sequences.bigWin]!.draft, tracks: [{ id: 't', name: 't', muted: false, solo: false, locked: false, clips: [{ id: 'c', name: '', presetId, effectType: pr.effectType, start: 0, overrides: { params: {} }, repeat: { count: 1, step: 0, order: 'forward' }, muted: false }] }], markers: [] }, lib).clips[0]!.tokens.values['color.accent'] as string
        ?? th.tokens['color.accent'];
    };
    const edit = (c: string) => { p = updateDraft<ThemeContent>(p, 'theme', S.classic, (d) => setToken(d, 'color.accent', c)); };
    const linked = S.presets.glow, snapped = S.presets.glow;
    void snapped;
    p = detachPresetToSnapshot(p, S.presets.confetti);
    edit('#00ff00');
    expect(colour(S.presets.glow)).toBe('#00ff00'); // linked follows
    expect(colour(S.presets.confetti)).toBe('#ffd23f'); // snapshot keeps the BANGERS default accent
    expect(p.presets[S.presets.confetti]!.draft).toMatchObject({ link: 'snapshot' });
    expect(p.presets[S.presets.confetti]!.draft.snapshot!.fromThemeId).toBe(S.classic);
    p = relinkPreset(p, S.presets.confetti);
    expect(p.presets[S.presets.confetti]!.draft).toMatchObject({ link: 'linked', snapshot: null });
    expect(colour(S.presets.confetti)).toBe('#00ff00');
    void linked;
  });

  it('presets can be created for any theme and carry overrides', () => {
    let p = createTheme(emptyProject(), 'T').project;
    const tid = Object.keys(p.themes)[0]!;
    const r = createPreset(p, { name: 'Big', effectType: 'coinBurst', themeId: tid, overrides: { params: { count: 300 } } });
    p = r.project;
    const pr = p.presets[r.id]!.draft as PresetContent;
    expect(pr.overrides.params.count).toBe(300);
    p = updateDraft<PresetContent>(p, 'preset', r.id, (d) => ({ ...d, overrides: setOverride(d.overrides, 'count', undefined) }));
    expect(p.presets[r.id]!.draft.overrides.params.count).toBeUndefined();
  });

  it('theme effect defaults prune empty entries', () => {
    let t: ThemeContent = createStarterProject().themes[S.neon]!.draft;
    t = updateEffectDefault(t, 'shockwave', (s) => setOverride(s, 'rings', undefined));
    expect(t.effectDefaults.shockwave).toBeUndefined();
  });
});

describe('undo / redo', () => {
  it('records labelled steps, coalesces drags, and clears redo on new change', () => {
    let now = 0;
    const store = new ProjectStore(createStarterProject(), 200, 700, () => now);
    const tokenOf = () => store.state.themes[S.neon]!.draft.tokens['intensity.master'];
    const set = (v: number, key?: string) => store.commit('Change master intensity', (p) => updateDraft<ThemeContent>(p, 'theme', S.neon, (d) => setToken(d, 'intensity.master', v)), key);
    set(0.5, 'drag'); now += 100; set(0.6, 'drag'); now += 100; set(0.7, 'drag');
    expect(store.history.depth).toBe(1); // one undo step for the whole drag
    expect(tokenOf()).toBe(0.7);
    now += 2000; set(1.5, 'drag');
    expect(store.history.depth).toBe(2); // window elapsed
    expect(store.undo()).toBe(true);
    expect(tokenOf()).toBe(0.7);
    expect(store.history.redoLabel).toBe('Change master intensity');
    expect(store.undo()).toBe(true);
    expect(tokenOf()).toBeUndefined();
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(true);
    expect(tokenOf()).toBe(0.7);
    store.commit('Rename', (p) => renameAsset(p, 'theme', S.neon, 'Renamed'));
    expect(store.history.canRedo).toBe(false);
    expect(store.commit('noop', (p) => p)).toBe(false);
    let notified = 0;
    store.subscribe(() => { notified++; });
    store.undo(); store.redo();
    expect(notified).toBe(2);
  });
  it('limits history depth', () => {
    const store = new ProjectStore(createStarterProject(), 5);
    for (let i = 0; i < 12; i++) store.commit(`s${i}`, (p) => renameAsset(p, 'theme', S.neon, `N${i}`));
    expect(store.history.depth).toBe(5);
  });
});

describe('import safety', () => {
  it('sanitises hostile theme content: unknown keys dropped, bounds clamped, bad refs removed', () => {
    const r = sanitizeTheme({
      tokens: { 'color.win': 'javascript:alert(1)', 'outline.width': 1e9, 'bogus.key': 1, 'surface.fill': { $ref: 'outline.width' }, 'color.accent': '#abc', 'type.display.size': '12' },
      effectDefaults: { coinBurst: { params: { count: -5, shape: 'x', evil: 1 }, cues: [{ id: 'a', at: 1e12, cue: 'whoosh', gain: 999 }] }, nonsense: { params: {} } },
      artDirection: { summary: 'x'.repeat(10000), mood: Array(50).fill('m') },
    });
    expect(r.value.tokens).toEqual({ 'outline.width': 20, 'color.accent': '#abc' });
    expect(r.value.effectDefaults.coinBurst!.params).toEqual({ count: 1 });
    expect(r.value.effectDefaults.coinBurst!.cues![0]).toMatchObject({ at: 60000, gain: 12 });
    expect(r.value.effectDefaults.nonsense).toBeUndefined();
    expect(r.value.artDirection.summary.length).toBe(4000);
    expect(r.value.artDirection.mood.length).toBe(12);
    expect(r.warnings.length).toBeGreaterThan(4);
  });
  it('sanitises sequences: limits, unknown effects, duplicate ids', () => {
    const r = sanitizeSequence({
      themeId: 't', scene: { cols: 999, rows: -4, pattern: 'x', seed: 'a' },
      tracks: [{ id: 'a', clips: [{ id: 'c', effectType: 'coinBurst', start: -50, repeat: { count: 9999, step: -1, order: 'x' } }, { id: 'c', effectType: 'nope' }, { id: 'c', effectType: 'flash' }] }],
      markers: [{ id: 'm', kind: 'cue', t: 5, name: 'whoosh' }, { id: 'm', kind: 'bad' }, { id: 'm', kind: 'event', t: 1e12, name: 'e' }], fixedDuration: 5,
    })!;
    expect(r.value.scene).toMatchObject({ cols: 12, rows: 1, pattern: 'line' });
    expect(r.value.tracks[0]!.clips.map((c) => c.id)).toEqual(['c', 'c_']);
    expect(r.value.tracks[0]!.clips[0]).toMatchObject({ start: 0, repeat: { count: 32, step: 0, order: 'forward' } });
    expect(r.value.markers.map((m) => m.id)).toEqual(['m', 'm_']);
    expect(r.value.fixedDuration).toBe(100);
  });
  it('rejects projects from a newer schema and reads old ones', () => {
    expect(() => sanitizeProject({ schema: 99 })).toThrow(/newer schema/);
    const { project } = sanitizeProject(JSON.parse(JSON.stringify(createStarterProject())));
    expect(Object.keys(project.themes).sort()).toEqual([S.classic, S.neon].sort());
    expect(getAsset(project, 'theme', S.classic)!.approvedVersionId).not.toBeNull();
  });
});

describe('theme package export / import', () => {
  it('round-trips a theme with presets, sequences, versions, approval and media into a fresh project', () => {
    let p = createStarterProject();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const hash = sha256Hex(bytes);
    p = { ...p, media: { m_logo: { id: 'm_logo', kind: 'image', name: 'logo.png', mime: 'image/png', size: bytes.length, hash, license: { id: 'CC0-1.0', name: 'CC0', redistributable: true } } } };
    p = updateDraft<ThemeContent>(p, 'theme', S.classic, (d) => setToken(d, 'asset.particle', 'm_logo'));
    const pkg = exportThemePackage(p, S.classic, (h) => (h === hash ? bytes : undefined));
    expect(pkg.media[0]!.data).toBe(bytesToBase64(bytes));
    expect(pkg.presets.length).toBe(6);
    const json = JSON.parse(JSON.stringify(pkg));
    const r = importThemePackage(emptyProject('other'), json);
    expect(r.warnings.filter((w) => !w.includes('clamped'))).toEqual([]);
    const imported = r.project.themes[r.themeId]!;
    expect(imported.name).toBe('BANGERS Classic');
    expect(imported.versions.length).toBe(1);
    expect(imported.approvedVersionId).toBe(imported.versions[0]!.id); // approval survives with remapped version id
    expect(imported.versions[0]!.id).not.toBe(p.themes[S.classic]!.versions[0]!.id);
    expect(Object.keys(r.project.presets).length).toBe(6);
    expect(Object.values(r.project.sequences).length).toBe(3);
    expect(Object.values(r.project.presets).every((x) => x.draft.themeId === r.themeId)).toBe(true);
    expect(r.blobs.get(hash)).toEqual(bytes);
    // identical rendering after import
    const orig = fingerprintSequence(compileSequence(p.sequences[S.sequences.bigWin]!.draft, libraryView(p)), ['desktop']);
    const seqId = Object.values(r.project.sequences).find((s) => s.name === 'Big win celebration')!.id;
    const back = fingerprintSequence(compileSequence(r.project.sequences[seqId]!.draft, libraryView(r.project)), ['desktop']);
    expect(back.viewports[0]!.samples.length).toBe(orig.viewports[0]!.samples.length);
    // second import into same project never overwrites, it adds a copy
    const r2 = importThemePackage(r.project, json);
    expect(Object.keys(r2.project.themes).length).toBe(2);
    expect(r2.project.themes[r2.themeId]!.name).toBe('BANGERS Classic (imported)');
  });
  it('refuses tampered media, unsafe SVG and unknown formats', () => {
    const p = createStarterProject();
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const hash = sha256Hex(bytes);
    const pkg = exportThemePackage(p, S.classic, () => undefined);
    pkg.media = [
      { id: 'm_a', kind: 'image', name: 'bad.svg', mime: 'image/svg+xml', size: bytes.length, hash, license: { id: 'x', name: 'x', redistributable: true }, data: bytesToBase64(bytes) },
      { id: 'm_b', kind: 'image', name: 'tampered.png', mime: 'image/png', size: 3, hash: sha256Hex(new Uint8Array([1, 2, 3])), license: { id: 'x', name: 'x', redistributable: true }, data: bytesToBase64(new Uint8Array([9, 9, 9])) },
      { id: 'm_c', kind: 'image', name: 'exe', mime: 'application/x-msdownload', size: 3, hash, license: { id: 'x', name: 'x', redistributable: true } },
    ];
    const r = importThemePackage(emptyProject(), JSON.parse(JSON.stringify(pkg)));
    expect(r.warnings.some((w) => /active content/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /checksum/.test(w))).toBe(true);
    expect(Object.keys(r.project.media)).toEqual([]);
    expect(() => importThemePackage(emptyProject(), { format: 'other' })).toThrow(/Not a BANGERS theme/);
    expect(() => importThemePackage(emptyProject(), { format: 'bangers.theme', schemaVersion: 50 })).toThrow(/newer schema/);
  });
});
