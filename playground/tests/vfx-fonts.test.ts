import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_CATEGORIES, FONT_FAMILIES, getFamily, pickFile, searchFonts } from '../src/vfx/fonts/catalog';
import { FontService, cssFamilyOf, type FaceLike } from '../src/vfx/fonts/service';
import { buildFontManifest, manifestText, usedFontFiles } from '../src/vfx/fonts/manifest';

const root = resolve(__dirname, '..');
const ALLOWED = new Set(['OFL-1.1', 'Apache-2.0', 'MIT']);

describe('font catalogue', () => {
  it('has at least 100 distinct families across the ten categories', () => {
    expect(FONT_FAMILIES.length).toBeGreaterThanOrEqual(100);
    expect(FONT_CATEGORIES.map((c) => c.id)).toEqual(['chunky', 'arcade', 'comic', 'condensed', 'rounded', 'fantasy', 'horror', 'scifi', 'western', 'elegant']);
    for (const c of FONT_CATEGORIES) expect(FONT_FAMILIES.filter((f) => f.category === c.id).length).toBeGreaterThanOrEqual(10);
  });

  it('lists each family once: no aliases, no weights counted as families, no duplicate files', () => {
    const names = new Set<string>(), ids = new Set<string>(), hashes = new Set<string>();
    for (const f of FONT_FAMILIES) {
      expect(names.has(f.family.toLowerCase()), `duplicate family ${f.family}`).toBe(false);
      names.add(f.family.toLowerCase()); ids.add(f.id);
      // a weight is not a family: no "… Bold", "… Light", "… Black" siblings of a family already present
      expect(/\b(bold|light|thin|medium|semibold|extrabold|black|regular)$/i.test(f.family), `${f.family} looks like a weight`).toBe(false);
      for (const x of f.files) { expect(hashes.has(x.sha256), `${x.file} duplicates another file`).toBe(false); hashes.add(x.sha256); }
    }
    expect(ids.size).toBe(FONT_FAMILIES.length);
  });

  it('records a verified, redistribution-friendly licence and source for every family', () => {
    for (const f of FONT_FAMILIES) {
      expect(ALLOWED.has(f.licenseId), `${f.id}: ${f.licenseId}`).toBe(true);
      expect(f.redistributionPermitted).toBe(true);
      expect(f.sourceUrl).toMatch(/^https:\/\/fonts\.google\.com\//);
      expect(f.licenseUrl).toMatch(/^https?:\/\//);
      expect(f.dateChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.copyright.length).toBeGreaterThan(5);
      expect(existsSync(resolve(root, 'assets', f.licenseFile.replace(/^fonts\//, 'fonts/catalog/'))), `${f.id} licence text`).toBe(true);
    }
  });

  it('ships every listed file, byte-for-byte as recorded', () => {
    for (const f of FONT_FAMILIES) for (const x of f.files) {
      const buf = readFileSync(resolve(root, 'assets/fonts/catalog', f.id, x.file));
      expect(buf.length).toBe(x.bytes);
      expect(createHash('sha256').update(buf).digest('hex')).toBe(x.sha256);
    }
  });

  it('picks the exact weight when it exists and reports when it does not', () => {
    const oswald = getFamily('oswald')!;
    expect(pickFile(oswald, 700, 'normal')).toMatchObject({ exact: true, file: { weight: 700 } });
    const bangers = getFamily('bangers')!;
    expect(pickFile(bangers, 900, 'normal')).toMatchObject({ exact: false, file: { weight: 400 } });
  });

  it('searches by name and category words', () => {
    expect(searchFonts({ text: 'pixel' }).length).toBeGreaterThan(0);
    expect(searchFonts({ text: 'lilita' }).map((f) => f.id)).toEqual(['lilita-one']);
    expect(searchFonts({ category: 'horror' }).every((f) => f.category === 'horror')).toBe(true);
    expect(searchFonts({ text: 'zzzz-nothing' })).toEqual([]);
  });
});

function harness(opts: { failIds?: string[]; delay?: number } = {}) {
  const added: string[] = [];
  const fetched: string[] = [];
  const svc = new FontService({
    cacheName: null,
    fetcher: async (fam, file, signal) => {
      fetched.push(file.file);
      await new Promise<void>((res, rej) => { const t = setTimeout(res, opts.delay ?? 5); signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }); });
      if (opts.failIds?.includes(fam.id)) throw new Error('HTTP 404');
      return new ArrayBuffer(file.bytes);
    },
    faceFactory: (family): FaceLike => ({ family, async load() { return this; } }),
    registry: { add: (f) => { added.push(f.family); } },
  });
  return { svc, added, fetched };
}

describe('FontService', () => {
  it('loads nothing until asked, then exactly the requested file', async () => {
    const { svc, fetched } = harness();
    expect(fetched).toEqual([]);
    expect(svc.status({ id: 'bangers', weight: 400, style: 'normal' }).state).toBe('idle');
    await svc.load({ id: 'bangers', weight: 400, style: 'normal' });
    expect(fetched).toEqual(['bangers-latin-400-normal.woff2']);
    expect(svc.status({ id: 'bangers', weight: 400, style: 'normal' }).state).toBe('loaded');
  });

  it('loads only the selected weight, never the whole family', async () => {
    const { svc, fetched } = harness();
    await svc.load({ id: 'oswald', weight: 700, style: 'normal' });
    expect(fetched).toEqual(['oswald-latin-700-normal.woff2']);
    expect(svc.status({ id: 'oswald', weight: 400, style: 'normal' }).state).toBe('idle');
  });

  it('deduplicates concurrent and repeated loads', async () => {
    const { svc, fetched } = harness();
    const spec = { id: 'anton', weight: 400, style: 'normal' } as const;
    await Promise.all([svc.load(spec), svc.load(spec), svc.load(spec)]);
    await svc.load(spec);
    expect(fetched.length).toBe(1);
    expect(svc.fetchCount).toBe(1);
  });

  it('cancels the fetch only when every waiter has cancelled', async () => {
    const { svc } = harness({ delay: 40 });
    const spec = { id: 'creepster', weight: 400, style: 'normal' } as const;
    const a = new AbortController(), b = new AbortController();
    const pa = svc.load(spec, a.signal), pb = svc.load(spec, b.signal);
    a.abort();
    await expect(pa).rejects.toMatchObject({ name: 'AbortError' });
    await pb;                                   // the second waiter still gets the font
    expect(svc.status(spec).state).toBe('loaded');
    const c = new AbortController();
    const spec2 = { id: 'nosifer', weight: 400, style: 'normal' } as const;
    const pc = svc.load(spec2, c.signal);
    c.abort();
    await expect(pc).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 60));
    expect(svc.status(spec2).state).toBe('idle');     // cancelled, not an error, and nothing registered
  });

  it('reports a failure visibly and never hands out a fallback family', async () => {
    const { svc, added } = harness({ failIds: ['rye'] });
    const spec = { id: 'rye', weight: 400, style: 'normal' } as const;
    await expect(svc.load(spec)).rejects.toThrow('HTTP 404');
    expect(svc.status(spec)).toMatchObject({ state: 'error', error: 'HTTP 404' });
    expect(() => svc.cssFamily(spec)).toThrow(/not loaded \(error/);
    expect(added).toEqual([]);
    const { failed } = await svc.loadAll([spec, { id: 'bangers', weight: 400, style: 'normal' }]);
    expect(failed.map((f) => f.spec.id)).toEqual(['rye']);
  });

  it('rejects unknown fonts and custom fonts that are not in the store', async () => {
    const { svc } = harness();
    await expect(svc.load({ id: 'no-such-font', weight: 400, style: 'normal' })).rejects.toThrow('Unknown font');
    expect(svc.status({ id: 'custom:abc', weight: 400, style: 'normal' }).state).toBe('error');
  });

  it('registers each weight under its own CSS family and requires the exact file', async () => {
    const { svc, added } = harness();
    await svc.load({ id: 'oswald', weight: 700, style: 'normal' });
    expect(added).toEqual([`${cssFamilyOf('oswald')}-700-normal`]);
    expect(svc.cssFont({ id: 'oswald', weight: 700, style: 'normal' }, 48)).toBe(`700 48px "${cssFamilyOf('oswald')}-700-normal"`);
  });

  it('accepts a custom font, rejects an unusable one, and keeps both visible', async () => {
    const added: string[] = [];
    const svc = new FontService({
      cacheName: null, fetcher: async () => new ArrayBuffer(0),
      faceFactory: (family, bytes): FaceLike => ({ family, async load() { if (bytes.byteLength < 4) throw new Error('Unsupported font data'); return this; } }),
      registry: { add: (f) => { added.push(f.family); } },
    });
    const meta = await svc.addCustom(new ArrayBuffer(64), { family: 'My Font', fileName: 'my.woff2' }, 'a'.repeat(64));
    expect(meta.id).toBe('custom:aaaaaaaaaaaa');
    expect(svc.isLoaded({ id: meta.id, weight: 400, style: 'normal' })).toBe(true);
    await expect(svc.addCustom(new ArrayBuffer(1), { family: 'Bad', fileName: 'bad.txt' }, 'b'.repeat(64))).rejects.toThrow('could not be used as a font');
    expect(svc.status({ id: 'custom:bbbbbbbbbbbb', weight: 400, style: 'normal' }).state).toBe('error');
  });

  it('notifies subscribers as states change', async () => {
    const { svc } = harness();
    let n = 0;
    svc.subscribe(() => { n++; });
    const v0 = svc.snapshot();
    await svc.load({ id: 'bangers', weight: 400, style: 'normal' });
    expect(n).toBeGreaterThanOrEqual(2);       // loading, loaded
    expect(svc.snapshot()).toBeGreaterThan(v0);
  });
});

describe('font licence manifest', () => {
  it('lists only the fonts and weights actually used, with licence data', () => {
    const m = buildFontManifest([
      { id: 'oswald', weight: 700, style: 'normal' }, { id: 'oswald', weight: 700, style: 'normal' }, { id: 'bangers', weight: 400, style: 'normal' },
    ], { generated: '2026-10-02' });
    expect(m.schema).toBe('bangers.font-licenses/1');
    expect(m.fonts.map((f) => f.id)).toEqual(['bangers', 'oswald']);
    const oswald = m.fonts.find((f) => f.id === 'oswald')!;
    expect(oswald.includedWeights).toEqual([700]);
    expect(oswald.includedFiles.map((f) => f.file)).toEqual(['fonts/oswald/oswald-latin-700-normal.woff2']);
    expect(oswald).toMatchObject({ licenseId: 'OFL-1.1', redistributionPermitted: true, userSupplied: false });
    expect(oswald.licenseFile).toBe('fonts/oswald/LICENSE.txt');
    for (const f of m.fonts) for (const k of ['family', 'source', 'sourceUrl', 'licenseId', 'licenseUrl', 'dateChecked'] as const) expect(f[k]).toBeTruthy();
    expect(manifestText(m)).toContain('Oswald');
  });

  it('marks custom fonts as the user\'s responsibility', () => {
    const custom = { id: 'custom:abc', family: 'Mine', fileName: 'Mine Regular.otf', weight: 400, style: 'normal' as const, bytes: 10, sha256: 'x' };
    const m = buildFontManifest([{ id: 'custom:abc', weight: 400, style: 'normal' }], { customs: (id) => (id === 'custom:abc' ? custom : undefined) });
    expect(m.fonts[0]).toMatchObject({ userSupplied: true, redistributionPermitted: 'user-responsibility', licenseId: 'user-supplied' });
    expect(usedFontFiles([{ id: 'custom:abc', weight: 400, style: 'normal' }], () => custom)[0]!.custom).toBe(true);
  });
});
