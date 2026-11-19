import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/core/util/sha256';
import { createZip, readZip, crc32, ZipError } from '../src/core/util/zip';
import { stableStringify } from '../src/core/util/json';
import { TOKEN_DEFS, TOKEN_BY_KEY } from '../src/core/tokens';
import { resolveTokens } from '../src/core/resolve';
import { isRef } from '../src/core/params';
import { EFFECT_LIST } from '../src/core/effects/registry';
import { compileSequence, evaluateFrame } from '../src/core/engine';
import { frameFingerprint } from '../src/core/fingerprint';
import { lib, seqWith } from './helpers';
import { roundDeep } from '../src/core/util/json';

describe('sha256', () => {
  it('matches known vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
});

describe('zip', () => {
  it('round-trips and is byte-deterministic', async () => {
    const entries = [{ path: 'a.txt', data: new TextEncoder().encode('hello') }, { path: 'dir/b.bin', data: new Uint8Array([0, 1, 2, 255]) }];
    const z1 = createZip(entries), z2 = createZip(entries);
    expect(Buffer.from(z1).equals(Buffer.from(z2))).toBe(true);
    const back = await readZip(z1);
    expect(back.map((e) => e.path)).toEqual(['a.txt', 'dir/b.bin']);
    expect(Array.from(back[1]!.data)).toEqual([0, 1, 2, 255]);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('rejects traversal, absolute and duplicate names', () => {
    for (const p of ['../x', '/abs', 'a/../b', 'a\\b', 'C:/x', 'a//b']) expect(() => createZip([{ path: p, data: new Uint8Array() }])).toThrow(ZipError);
    expect(() => createZip([{ path: 'a', data: new Uint8Array() }, { path: 'a', data: new Uint8Array() }])).toThrow(/Duplicate/);
  });
  it('reads archives produced by the system zip tool (deflate)', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const d = mkdtempSync(join(tmpdir(), 'zt-'));
    writeFileSync(join(d, 'big.txt'), 'bangers '.repeat(5000));
    execFileSync('zip', ['-q', '-9', 'out.zip', 'big.txt'], { cwd: d });
    const entries = await readZip(new Uint8Array(readFileSync(join(d, 'out.zip'))));
    expect(new TextDecoder().decode(entries[0]!.data)).toBe('bangers '.repeat(5000));
  });
  it('detects corruption', async () => {
    const z = createZip([{ path: 'a.txt', data: new TextEncoder().encode('hello world') }]);
    z[40] = z[40]! ^ 0xff;
    await expect(readZip(z)).rejects.toThrow(/CRC/);
  });
});

describe('token catalogue', () => {
  it('has unique keys with sane bounds and defaults inside bounds', () => {
    const keys = new Set<string>();
    for (const d of TOKEN_DEFS) {
      expect(keys.has(d.key), d.key).toBe(false);
      keys.add(d.key);
      expect(d.description.length, d.key).toBeGreaterThan(3);
      if (d.kind === 'number') {
        expect(d.min < d.max, d.key).toBe(true);
        expect(d.step > 0, d.key).toBe(true);
        expect(d.unit, d.key).not.toBeUndefined();
        if (!isRef(d.default)) expect(d.default >= d.min && d.default <= d.max, `${d.key} default in bounds`).toBe(true);
      }
    }
  });
  it('resolves every token with no warnings and no reference cycles', () => {
    const r = resolveTokens({});
    expect(r.warnings).toEqual([]);
    for (const d of TOKEN_DEFS) {
      expect(r.values[d.key], d.key).not.toBeUndefined();
      if (isRef(d.default)) expect(TOKEN_BY_KEY.has(d.default.$ref), `${d.key} -> ${d.default.$ref}`).toBe(true);
    }
  });
  it('expands references and records provenance', () => {
    const r = resolveTokens({ 'color.surface': '#112233', 'outline.width': 99 });
    expect(r.values['surface.fill']).toBe('#112233');
    expect(r.sources['color.surface']).toBe('theme');
    expect(r.sources['surface.fill']).toBe('bangers');
    expect(r.values['outline.width']).toBe(20); // clamped to max
    expect(r.warnings.some((w) => w.key === 'outline.width')).toBe(true);
  });
  it('survives circular and invalid references by falling back', () => {
    const r = resolveTokens({ 'surface.fill': { $ref: 'surface.fillAlt' }, 'surface.fillAlt': { $ref: 'surface.fill' }, 'outline.width': { $ref: 'color.primary' } });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(typeof r.values['surface.fill']).toBe('string');
    expect(r.values['outline.width']).toBe(4);
  });
});

describe('effects', () => {
  it('registers all 12 required effects with unique types', () => {
    expect(EFFECT_LIST.map((e) => e.type).sort()).toEqual(
      ['anticipationGlow', 'bigWinBanner', 'cascadeDrop', 'coinBurst', 'flash', 'multiplierPop', 'screenShake', 'shine', 'shockwave', 'symbolHighlight', 'textCallout', 'winLine'],
    );
  });
  for (const def of EFFECT_LIST) {
    it(`${def.type}: params are well-formed and defaults are within bounds`, () => {
      const keys = new Set<string>();
      for (const p of def.params) {
        expect(keys.has(p.key), p.key).toBe(false);
        keys.add(p.key);
        if (p.kind === 'number') {
          expect(p.min < p.max && p.step > 0 && p.unit !== undefined, p.key).toBe(true);
          if (!isRef(p.default)) expect(p.default >= p.min && p.default <= p.max, `${p.key} default in bounds`).toBe(true);
        }
        if (p.activeWhen) expect(keys.has(p.activeWhen.key) || def.params.some((q) => q.key === p.activeWhen!.key) || TOKEN_BY_KEY.has(p.activeWhen.key), `${p.key} activeWhen target`).toBe(true);
      }
      expect(keys.has('duration') && keys.has('intensity')).toBe(true);
    });
    it(`${def.type}: evaluates over its whole life without NaN and deterministically`, () => {
      const seq = seqWith(def.type);
      const c = compileSequence(seq, lib());
      expect(c.warnings).toEqual([]);
      expect(c.duration).toBeGreaterThan(0);
      let drewSomething = false;
      for (const t of [0, c.duration * 0.1, c.duration * 0.33, c.duration * 0.5, c.duration * 0.8, c.duration]) {
        const f1 = evaluateFrame(c, t, { viewport: { w: 1280, h: 720 } });
        const f2 = evaluateFrame(c, t, { viewport: { w: 1280, h: 720 } });
        expect(() => roundDeep(f1.ops)).not.toThrow();
        expect(frameFingerprint(f1)).toBe(frameFingerprint(f2));
        if (f1.active.length && (f1.ops.length > 0)) drewSomething = true;
      }
      expect(drewSomething).toBe(true);
    });
  }
  it('different seeds change particle output', () => {
    const a = seqWith('coinBurst'); const b = seqWith('coinBurst');
    b.tracks[0]!.clips[0]!.overrides.params.seed = 42;
    const fa = evaluateFrame(compileSequence(a, lib()), 500, { viewport: { w: 1280, h: 720 } });
    const fb = evaluateFrame(compileSequence(b, lib()), 500, { viewport: { w: 1280, h: 720 } });
    expect(frameFingerprint(fa)).not.toBe(frameFingerprint(fb));
  });
  it('stable JSON is key-order independent', () => {
    expect(stableStringify({ b: 1, a: { d: 1, c: 2 } })).toBe(stableStringify({ a: { c: 2, d: 1 }, b: 1 }));
  });
});

import { readFileSync } from 'node:fs';
import { parameterReference } from '../src/core/docs';
import { sanitizeProject } from '../src/core/model/exchange';
import { createStarterProject } from '../src/core/starter';
import { themeCss } from '../src/core/bundle/css';
import { resolveTokens as resolveTokensForCss } from '../src/core/resolve';

describe('generated documentation', () => {
  it('docs/parameters.md matches the parameter definitions (run `npm run bangers -- docs docs/parameters.md` to refresh)', () => {
    expect(readFileSync('docs/parameters.md', 'utf8')).toBe(parameterReference() + '\n');
  });
  it('documents every effect and every parameter', () => {
    const md = parameterReference();
    for (const e of EFFECT_LIST) { expect(md).toContain(`(\`${e.type}\`)`); for (const p of e.params) expect(md).toContain(`| \`${p.key}\` |`); }
  });
});

describe('hostile font metadata cannot inject CSS', () => {
  it('strips quotes, braces, newlines and urls from user font names before they reach theme.css', () => {
    const p = createStarterProject();
    const raw = JSON.parse(JSON.stringify(p));
    raw.media.m_f = { id: 'm_f', kind: 'font', name: 'x.woff2', mime: 'font/woff2', size: 4, hash: 'a'.repeat(64), license: { id: 'OFL-1.1', name: 'OFL', redistributable: true } };
    raw.fonts.evil = { id: 'evil', label: 'x', family: 'Evil"; } body { background: url(https://evil.example/x) } /*\n', fallback: 'serif; } body { x: url(https://evil.example) }', files: [{ weight: 400, style: 'normal', mediaId: 'm_f' }], license: { id: 'OFL-1.1', name: 'OFL', redistributable: true } };
    const f = sanitizeProject(raw).project.fonts.evil!;
    expect(f.family).not.toMatch(/["{};()\n\\/:]/);
    expect(f.fallback).not.toMatch(/[{};()\\/:]/);
    const css = themeCss(resolveTokensForCss({}), [{ id: 'evil', family: f.family, fallback: f.fallback, origin: 'user', bundled: true, files: [{ path: 'fonts/evil/a.woff2', weight: 400, style: 'normal', format: 'woff2', sha256: 'x', size: 1 }], license: 'k' }]);
    expect(css).not.toMatch(/url\(\s*["']?https?:/i); // no external fetch can be smuggled in
    expect(css.match(/\{/g)!.length).toBe(css.match(/\}/g)!.length); // braces stay balanced
    expect(css.match(/@font-face/g)!.length).toBe(1); // exactly the one rule we wrote, no injected rules
    expect(css.match(/^\s*body\b/m)).toBeNull();
    expect(css.match(/font-family: "([^"]*)"/)![1]).toBe(f.family); // the whole family stays inside its quotes
  });
});
