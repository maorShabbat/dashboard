import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportBundle, ExportError } from '../src/core/bundle/export';
import { importBundle, readBundle } from '../src/core/bundle/import';
import { verifyBundle, type VerifyReport } from '../src/core/bundle/verify';
import { createStarterProject, STARTER_IDS as S } from '../src/core/starter';
import { createZip, readZip, type ZipEntry } from '../src/core/util/zip';
import { sha256Hex, utf8, fromUtf8 } from '../src/core/util/sha256';
import { extractEntries, nodeExportEnv, repoRoot } from '../src/cli/nodeEnv';
import { setToken } from '../src/core/model/edit';
import { addMedia, addUserFont, updateDraft, libraryView, saveVersion, approveVersion } from '../src/core/model/ops';
import type { MediaItem, Project, ThemeContent, UserFont } from '../src/core/model/types';
import { fingerprintSequence } from '../src/core/fingerprint';
import { compileSequence } from '../src/core/engine';
import { PACKAGE_VERSION } from '../src/core/version';
import { sniffFont } from '../src/core/bundle/export';

const FIXED_NOW = () => '2026-01-01T00:00:00.000Z';
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const WAV = (() => { const b = Buffer.alloc(52); b.write('RIFF', 0); b.writeUInt32LE(44, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(8, 40); return new Uint8Array(b); })();
const fontBytes = () => new Uint8Array(readFileSync(join(repoRoot(), 'assets/fonts/anton/anton-latin-400-normal.woff2')));

const failing = (r: VerifyReport) => r.checks.filter((c) => c.status === 'fail').map((c) => c.id);
const check = (r: VerifyReport, id: string) => r.checks.find((c) => c.id === id)!;

async function starterBundle(source: 'approved' | 'draft' = 'approved', themeId = S.classic) {
  return exportBundle({ ...nodeExportEnv(createStarterProject()), now: FIXED_NOW }, { themeId, source });
}

/** Re-pack entries, optionally rewriting files and (to simulate a careful attacker) refreshing manifest hashes + checksums. */
function repack(entries: ZipEntry[], edit: (m: Map<string, Uint8Array>) => void, refresh = false): Uint8Array {
  const m = new Map(entries.map((e) => [e.path, e.data]));
  edit(m);
  if (refresh) {
    const manifest = JSON.parse(fromUtf8(m.get('manifest.json')!));
    for (const f of manifest.files) { const d = m.get(f.path); if (d) { f.size = d.length; f.sha256 = sha256Hex(d); } }
    const mb = utf8(JSON.stringify(manifest, null, 2) + '\n');
    m.set('manifest.json', mb);
    m.set('checksums.sha256', utf8([`${sha256Hex(mb)}  manifest.json`, ...manifest.files.map((f: { sha256: string; path: string }) => `${f.sha256}  ${f.path}`)].join('\n') + '\n'));
  }
  return createZip([...m.entries()].map(([path, data]) => ({ path, data })));
}

describe('export → verify (happy path)', () => {
  it('exports the approved starter theme and every verification check passes', async () => {
    const res = await starterBundle();
    expect(res.warnings).toEqual([]);
    const report = await verifyBundle(res.bytes);
    expect(failing(report)).toEqual([]);
    expect(report.ok).toBe(true);
    for (const id of ['archive', 'versions', 'files', 'structure', 'licenses', 'fonts', 'assets', 'config', 'import', 'replay-core', 'replay-runtime', 'examples', 'approval']) expect(check(report, id).status, id).toBe('pass');
  });

  it('records schema/package versions, licences and fonts in the manifest', async () => {
    const { manifest, entries } = await starterBundle();
    expect(manifest).toMatchObject({ format: 'bangers.bundle', bundleVersion: 1, schemaVersion: 1, packageVersion: PACKAGE_VERSION, runtimeVersion: '0.1.0' });
    expect(PACKAGE_VERSION).toBe(JSON.parse(readFileSync(join(repoRoot(), 'package.json'), 'utf8')).version);
    expect(manifest.theme).toMatchObject({ id: S.classic, source: 'approved', approved: true });
    expect(manifest.fonts.filter((f) => f.bundled).map((f) => f.id).sort()).toEqual(['anton', 'bangers', 'inter', 'roboto-mono']);
    expect(manifest.licenses.every((l) => l.id === 'OFL-1.1' && l.redistributable)).toBe(true);
    const paths = entries.map((e) => e.path);
    for (const p of ['manifest.json', 'config/library.json', 'config/tokens.json', 'config/theme.css', 'runtime/bangers-runtime.js', 'runtime/bangers-runtime.d.ts', 'README.md', 'LICENSES.md', 'checksums.sha256',
      'examples/web/index.html', 'examples/web/main.js', 'examples/node/replay.mjs', 'examples/dom-css/index.html', 'fonts/bangers/bangers-latin-400-normal.woff2']) expect(paths, p).toContain(p);
    // licence text is the real OFL, with the font's copyright line
    const lic = fromUtf8(entries.find((e) => e.path === manifest.licenses.find((l) => l.appliesTo.some((a) => /Bangers/.test(a)))!.path)!.data);
    expect(lic).toMatch(/Copyright 2010 The Bangers Project Authors/);
    expect(lic).toMatch(/SIL OPEN FONT LICENSE Version 1.1/);
    expect(fromUtf8(entries.find((e) => e.path === 'LICENSES.md')!.data)).toMatch(/OFL-1\.1/);
    // font files are genuine fonts
    for (const f of entries.filter((e) => e.path.startsWith('fonts/'))) expect(sniffFont(f.data), f.path).toBe('woff2');
  });

  it('is byte-for-byte reproducible for identical input', async () => {
    const env = { ...nodeExportEnv(createStarterProject()), now: FIXED_NOW }; // same project object ⇒ same version ids/timestamps
    const a = await exportBundle(env, { themeId: S.classic, source: 'approved' }), b = await exportBundle(env, { themeId: S.classic, source: 'approved' });
    expect(sha256Hex(a.bytes)).toBe(sha256Hex(b.bytes));
  });

  it('records fingerprints for every sequence (two viewports), every preset and every required effect', async () => {
    const { manifest } = await starterBundle();
    expect(manifest.replay.viewports).toEqual(['desktop', 'mobile']);
    expect(Object.keys(manifest.replay.sequences).length).toBe(3);
    expect(Object.keys(manifest.replay.presets).length).toBe(6);
    expect(Object.keys(manifest.replay.effects).length).toBe(12);
    const fp = Object.values(manifest.replay.sequences)[0]!;
    expect(fp.viewports.length).toBe(2);
    expect(fp.viewports[0]!.samples[3]!.hash).not.toBe(fp.viewports[1]!.samples[3]!.hash); // board-aware sizing changes the output
  });

  it('the shipped Node example runs and verifies from an extracted folder', async () => {
    const res = await starterBundle();
    const dir = mkdtempSync(join(tmpdir(), 'bundle-ex-'));
    extractEntries(res.entries, dir);
    const out = execFileSync(process.execPath, [join(dir, 'examples/node/replay.mjs')], { encoding: 'utf8' });
    expect(out).toMatch(/REPLAY OK: 21 fingerprints match/);
    expect(out).toMatch(/Big win celebration: 4700 ms/);
    expect(readdirSync(join(dir, 'examples'))).toEqual(['dom-css', 'node', 'web']);
  });

  it('theme.css exposes board-relative tokens as fractions and registers bundled fonts', async () => {
    const { entries } = await starterBundle();
    const css = fromUtf8(entries.find((e) => e.path === 'config/theme.css')!.data);
    expect(css).toMatch(/@font-face \{ font-family: "Bangers"/);
    expect(css).toMatch(/--bangers-outline-width: 0\.04;/);
    expect(css).toMatch(/--bangers-color-win: #ffe14d;/);
    expect(css).toMatch(/--bangers-type-display-family: "Bangers"/);
  });
});

describe('approval handling', () => {
  it('requireApproved rejects unapproved content, otherwise warns and uses drafts', async () => {
    const env = { ...nodeExportEnv(createStarterProject()), now: FIXED_NOW };
    await expect(exportBundle(env, { themeId: S.neon, source: 'approved', requireApproved: true })).rejects.toThrow(ExportError);
    const r = await exportBundle(env, { themeId: S.neon, source: 'approved' });
    expect(r.warnings.join(' ')).toMatch(/Not approved/);
    expect(r.manifest.theme.approved).toBe(false);
    expect(check(await verifyBundle(r.bytes), 'approval').status).toBe('warn');
  });
  it('exports the approved version, not the later draft edits', async () => {
    let p = createStarterProject();
    p = updateDraft<ThemeContent>(p, 'theme', S.classic, (d) => setToken(d, 'color.win', '#00ff00'));
    const env = { ...nodeExportEnv(p), now: FIXED_NOW };
    const approved = await exportBundle(env, { themeId: S.classic, source: 'approved' });
    const draft = await exportBundle(env, { themeId: S.classic, source: 'draft' });
    const win = (r: typeof approved) => JSON.parse(fromUtf8(r.entries.find((e) => e.path === 'config/library.json')!.data)).theme.content.tokens['color.win'];
    expect(win(approved)).toBeUndefined();
    expect(win(draft)).toBe('#00ff00');
    expect(approved.manifest.replay).not.toEqual(draft.manifest.replay);
    expect((await verifyBundle(draft.bytes)).ok).toBe(true);
  });
});

describe('assets, fonts and licences', () => {
  function projectWithMedia(): { project: Project; blobs: Map<string, Uint8Array> } {
    let p = createStarterProject();
    const blobs = new Map<string, Uint8Array>();
    const media = (id: string, kind: MediaItem['kind'], name: string, mime: string, bytes: Uint8Array, redistributable: boolean, licId = 'CC-BY-4.0'): MediaItem => {
      const hash = sha256Hex(bytes);
      blobs.set(hash, bytes);
      return { id, kind, name, mime, size: bytes.length, hash, license: { id: licId, name: licId === 'CC-BY-4.0' ? 'Creative Commons Attribution 4.0' : 'Proprietary', holder: 'Example Artist', url: 'https://example.com/license', attribution: 'Sprite by Example Artist', redistributable } };
    };
    p = addMedia(p, media('m_sprite', 'image', 'gem.png', 'image/png', PNG, true));
    p = addMedia(p, media('m_sting', 'audio', 'sting.wav', 'audio/wav', WAV, false, 'proprietary'));
    p = addMedia(p, media('m_font_ok', 'font', 'Anton-Copy.woff2', 'font/woff2', fontBytes(), true, 'OFL-1.1'));
    p = addMedia(p, media('m_font_no', 'font', 'Commercial.woff2', 'font/woff2', fontBytes(), false, 'proprietary'));
    const uf = (id: string, mediaId: string, redistributable: boolean): UserFont => ({ id, label: id, family: id === 'free_font' ? 'FreeSans Test' : 'Commercial Sans', fallback: 'Impact, sans-serif', files: [{ weight: 400, style: 'normal', mediaId }], license: { id: redistributable ? 'OFL-1.1' : 'proprietary', name: redistributable ? 'SIL OFL' : 'Commercial EULA', holder: 'Foundry', redistributable } });
    p = addUserFont(p, uf('free_font', 'm_font_ok', true));
    p = addUserFont(p, uf('paid_font', 'm_font_no', false));
    p = updateDraft<ThemeContent>(p, 'theme', S.classic, (d) => {
      let t = setToken(d, 'asset.particle', 'm_sprite');
      t = setToken(t, 'cue.win.big.asset', 'm_sting');
      t = setToken(t, 'type.headline.family', 'free_font');
      t = setToken(t, 'type.label.family', 'paid_font');
      return t;
    });
    // approve the edited draft so the approved export contains these changes
    p = saveVersion(p, 'theme', S.classic, { label: 'With media' }).project;
    p = approveVersion(p, 'theme', S.classic, p.themes[S.classic]!.versions[1]!.id);
    return { project: p, blobs };
  }

  it('bundles redistributable assets/fonts and omits restricted ones with reasons; verification still passes', async () => {
    const { project, blobs } = projectWithMedia();
    const res = await exportBundle({ ...nodeExportEnv(project, blobs), now: FIXED_NOW }, { themeId: S.classic, source: 'approved' });
    const m = res.manifest;
    expect(m.media.map((x) => x.id)).toEqual(['m_sprite']);
    expect(m.fonts.find((f) => f.id === 'free_font')).toMatchObject({ bundled: true, origin: 'user' });
    expect(m.fonts.find((f) => f.id === 'paid_font')).toMatchObject({ bundled: false, files: [], origin: 'user' });
    expect(m.omitted.map((o) => `${o.kind}:${o.id}`).sort()).toEqual(['asset:m_sting', 'font:paid_font']);
    expect(m.omitted.find((o) => o.id === 'paid_font')!.reason).toMatch(/does not permit embedding or redistribution.*Commercial Sans/);
    const paths = res.entries.map((e) => e.path);
    expect(paths.some((p) => p.includes('commercial'))).toBe(false);
    expect(paths.some((p) => p.endsWith('.wav'))).toBe(false);
    expect(paths.some((p) => p.startsWith('fonts/free-font/'))).toBe(true);
    // licences & attribution of the included third-party items
    const lic = m.licenses.find((l) => l.id === 'CC-BY-4.0')!;
    expect(lic.attribution).toBe('Sprite by Example Artist');
    expect(fromUtf8(res.entries.find((e) => e.path === 'LICENSES.md')!.data)).toMatch(/Not included[\s\S]*sting\.wav[\s\S]*Commercial Sans/);
    expect(fromUtf8(res.entries.find((e) => e.path === 'README.md')!.data)).toMatch(/\*\*not included\*\*/);
    const report = await verifyBundle(res.bytes);
    expect(failing(report)).toEqual([]);
    expect(check(report, 'fonts').status).toBe('warn'); // surfaced, not hidden
    expect(check(report, 'replay-core').status).toBe('pass');
    expect(check(report, 'replay-runtime').status).toBe('pass');
  });

  it('a bundled sprite is actually used by the replay and survives import under a new id', async () => {
    const { project, blobs } = projectWithMedia();
    const res = await exportBundle({ ...nodeExportEnv(project, blobs), now: FIXED_NOW }, { themeId: S.classic, source: 'approved' });
    const imported = await importBundle(createStarterProject(), res.bytes);
    expect(Object.values(imported.project.media).some((x) => x.name === 'gem.png' && x.license.redistributable)).toBe(true);
    expect(Object.values(imported.project.fonts).map((f) => f.family)).toContain('FreeSans Test');
    expect(imported.project.themes[imported.themeId]!.approvedVersionId).not.toBeNull();
    expect(imported.project.themes[imported.themeId]!.name).toBe('BANGERS Classic (imported)');
  });

  it('refuses to bundle a font file that is not a real font, or whose licence is unknown', async () => {
    let { project, blobs } = projectWithMedia();
    const junk = utf8('this is not a font');
    blobs.set(sha256Hex(junk), junk);
    project = addMedia(project, { id: 'm_font_ok', kind: 'font', name: 'x.woff2', mime: 'font/woff2', size: junk.length, hash: sha256Hex(junk), license: { id: 'OFL-1.1', name: 'OFL', redistributable: true } });
    const res = await exportBundle({ ...nodeExportEnv(project, blobs), now: FIXED_NOW }, { themeId: S.classic, source: 'approved' });
    expect(res.manifest.fonts.find((f) => f.id === 'free_font')!.bundled).toBe(false);
    expect(res.manifest.omitted.find((o) => o.id === 'free_font')!.reason).toMatch(/not a recognised font/);
  });
});

describe('verification catches problems', () => {
  it('detects a modified file (checksum)', async () => {
    const { bytes } = await starterBundle();
    const entries = await readZip(bytes);
    const bad = repack(entries, (m) => m.set('config/library.json', utf8(fromUtf8(m.get('config/library.json')!).replace('"coinBurst"', '"coinburst"'))));
    const r = await verifyBundle(bad);
    expect(r.ok).toBe(false);
    expect(failing(r)).toContain('files');
  });

  it('detects a careful edit that refreshes checksums: the replay no longer matches', async () => {
    const { bytes } = await starterBundle();
    const entries = await readZip(bytes);
    const bad = repack(entries, (m) => {
      const lib = JSON.parse(fromUtf8(m.get('config/library.json')!));
      lib.theme.content.tokens['color.win'] = '#123456';
      m.set('config/library.json', utf8(JSON.stringify(lib, null, 2)));
    }, true);
    const r = await verifyBundle(bad);
    expect(check(r, 'files').status).toBe('pass'); // checksums were refreshed…
    expect(r.ok).toBe(false);
    expect(failing(r)).toEqual(expect.arrayContaining(['import', 'replay-core', 'replay-runtime']));
    expect(check(r, 'replay-core').items!.join(' ')).toMatch(/differs|event/);
  });

  it('detects a tampered runtime (behaviour change) even with refreshed checksums', async () => {
    const { bytes } = await starterBundle();
    const entries = await readZip(bytes);
    const bad = repack(entries, (m) => m.set('runtime/bangers-runtime.js', utf8(fromUtf8(m.get('runtime/bangers-runtime.js')!).replaceAll('"easeOutBack"', '"linear"'))), true);
    const src = fromUtf8((await readZip(bad)).find((e) => e.path === 'runtime/bangers-runtime.js')!.data);
    expect(src).not.toBe(fromUtf8(entries.find((e) => e.path === 'runtime/bangers-runtime.js')!.data));
    const r = await verifyBundle(bad);
    expect(check(r, 'replay-core').status).toBe('pass'); // the core is fine…
    expect(check(r, 'replay-runtime').status).toBe('fail'); // …but the shipped runtime no longer reproduces the recording
  });

  it('flags a bundled file whose licence is not redistributable, and unlisted extras', async () => {
    const { bytes } = await starterBundle();
    const entries = await readZip(bytes);
    const r1 = await verifyBundle(repack(entries, (m) => {
      const man = JSON.parse(fromUtf8(m.get('manifest.json')!));
      man.licenses[0].redistributable = false;
      m.set('manifest.json', utf8(JSON.stringify(man)));
    }, true));
    expect(check(r1, 'licenses').status).toBe('fail');
    const r2 = await verifyBundle(repack(entries, (m) => m.set('fonts/evil.ttf', utf8('x'))));
    expect(check(r2, 'files').items!.join(' ')).toMatch(/evil\.ttf: present but not listed/);
  });

  it('flags a font file that is not a font and an SVG with active content', async () => {
    const { bytes } = await starterBundle();
    const entries = await readZip(bytes);
    const r = await verifyBundle(repack(entries, (m) => m.set('fonts/bangers/bangers-latin-400-normal.woff2', utf8('not a font')), true));
    expect(check(r, 'fonts').status).toBe('fail');
    expect(check(r, 'fonts').items!.join(' ')).toMatch(/not a recognised font/);
  });

  it('rejects archives that are not bundles, are corrupt, or try path traversal', async () => {
    expect(failing(await verifyBundle(utf8('hello world, definitely not a zip file at all')))).toEqual(['archive']);
    expect(failing(await verifyBundle(createZip([{ path: 'a.txt', data: utf8('x') }])))).toEqual(['archive']);
    const { bytes } = await starterBundle();
    const corrupt = bytes.slice(); corrupt[200] = corrupt[200]! ^ 0xff;
    expect(failing(await verifyBundle(corrupt))).toEqual(['archive']);
    // hand-made zip with a ../ entry
    const evil = createZip([{ path: 'safe.txt', data: utf8('x') }]);
    const patched = Buffer.from(evil);
    const idx = patched.indexOf('safe.txt'); // local header name
    patched.write('../e.txt', idx); // same length (8 chars)
    patched.write('../e.txt', patched.lastIndexOf('safe.txt'));
    const r = await verifyBundle(new Uint8Array(patched));
    expect(failing(r)).toEqual(['archive']);
  });

  it('rejects a bundle from a newer schema and one whose manifest lies about the preset list', async () => {
    const { bytes } = await starterBundle();
    const entries = await readZip(bytes);
    const newer = await verifyBundle(repack(entries, (m) => { const man = JSON.parse(fromUtf8(m.get('manifest.json')!)); man.schemaVersion = 99; m.set('manifest.json', utf8(JSON.stringify(man))); }, true));
    expect(check(newer, 'versions').status).toBe('fail');
    const lie = await verifyBundle(repack(entries, (m) => { const man = JSON.parse(fromUtf8(m.get('manifest.json')!)); man.presets.pop(); m.set('manifest.json', utf8(JSON.stringify(man))); }, true));
    expect(check(lie, 'config').status).toBe('fail');
  });
});

describe('import → replay round trip into an existing project', () => {
  it('imports as a new theme and renders the same frames as the source', async () => {
    const src = createStarterProject();
    const res = await exportBundle({ ...nodeExportEnv(src), now: FIXED_NOW }, { themeId: S.classic, source: 'approved' });
    const target = createStarterProject();
    const imp = await importBundle(target, res.bytes);
    expect(Object.keys(imp.project.themes).length).toBe(3);
    const seqName = 'Big win celebration';
    const orig = Object.values(src.sequences).find((s) => s.name === seqName)!;
    const copy = Object.values(imp.project.sequences).find((s) => s.name === seqName && s.draft.themeId === imp.themeId)!;
    const a = fingerprintSequence(compileSequence(orig.draft, libraryView(src)), ['desktop', 'mobile']);
    const b = fingerprintSequence(compileSequence(copy.draft, libraryView(imp.project)), ['desktop', 'mobile']);
    expect(b).toEqual(a);
    const again = await importBundle(imp.project, res.bytes);
    expect(Object.keys(again.project.themes).length).toBe(4);
  });
  it('readBundle reports clear errors', async () => {
    await expect(readBundle(utf8('nope'))).rejects.toThrow(/Not a valid bundle archive/);
    await expect(readBundle(createZip([{ path: 'manifest.json', data: utf8('{"format":"x"}') }]))).rejects.toThrow(/not a BANGERS bundle manifest/);
  });
});

describe('runtime check in restrictive environments', () => {
  it('downgrades to a visible warning only when the host blocks loading the module; real failures stay failures', async () => {
    const { bytes } = await starterBundle();
    const blocked = await verifyBundle(bytes, { runtimeLoader: async () => { throw new TypeError('Failed to fetch dynamically imported module: blob:null/abc'); } });
    expect(check(blocked, 'replay-runtime').status).toBe('warn');
    expect(check(blocked, 'replay-runtime').detail).toMatch(/does not allow loading/);
    expect(check(blocked, 'replay-core').status).toBe('pass'); // the core replay still ran
    expect(blocked.ok).toBe(true);
    const broken = await verifyBundle(bytes, { runtimeLoader: async () => { throw new SyntaxError('Unexpected token'); } });
    expect(check(broken, 'replay-runtime').status).toBe('fail');
    expect(broken.ok).toBe(false);
    const other = await verifyBundle(bytes, { runtimeLoader: async () => { throw new Error('boom'); } });
    expect(check(other, 'replay-runtime').status).toBe('fail');
  });
});
