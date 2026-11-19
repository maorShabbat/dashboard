// Fetches the catalogue fonts from their Fontsource packages (registry tarballs), verifies the licence of every family and
// writes the files, the licence texts and the catalogue/manifest used by the app and by exported bundles.
//   node scripts/fetch-fonts.mjs            (uses .cache/fontsource for tarballs)
// Output: assets/fonts/catalog/<id>/{*.woff2, LICENSE.txt}, src/vfx/fonts/catalog.json
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, FONTS, WEIGHT_OVERRIDES } from './font-list.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache/fontsource');
const outDir = join(root, 'assets/fonts/catalog');
mkdirSync(cache, { recursive: true });
mkdirSync(outDir, { recursive: true });

/** Licences under which a family may be used commercially AND redistributed inside a bundle (with its licence text). */
const ALLOWED = {
  'OFL-1.1': { name: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org', note: 'May be used commercially and embedded/redistributed with the licence text; the font may not be sold on its own.' },
  'Apache-2.0': { name: 'Apache License 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0', note: 'May be used commercially and redistributed with the licence text.' },
  'MIT': { name: 'MIT License', url: 'https://opensource.org/license/mit', note: 'May be used commercially and redistributed with the licence text.' },
};
const WANT_WEIGHTS = [400, 700];
const today = new Date().toISOString().slice(0, 10);

function sh(cmd, args, cwd) { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }); }

const entries = [];
const problems = [];
const seenFamily = new Set();
for (const cat of CATEGORIES) {
  for (const id of FONTS[cat.id]) {
    try {
      let tgz = readdirSync(cache).find((f) => f.startsWith(`fontsource-${id}-`) && f.endsWith('.tgz'));
      if (!tgz) { sh('npm', ['pack', `@fontsource/${id}@5`, '--silent'], cache); tgz = readdirSync(cache).find((f) => f.startsWith(`fontsource-${id}-`) && f.endsWith('.tgz')); }
      if (!tgz) throw new Error('package not found');
      const work = join(cache, `x-${id}`);
      rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
      sh('tar', ['-xzf', join(cache, tgz), '-C', work]);
      const pkg = JSON.parse(readFileSync(join(work, 'package/package.json'), 'utf8'));
      const meta = JSON.parse(readFileSync(join(work, 'package/metadata.json'), 'utf8'));
      const spdx = meta.license?.type ?? pkg.license;
      if (!ALLOWED[spdx]) throw new Error(`licence ${spdx} is not on the commercial-use allowlist`);
      if (meta.type !== 'google') throw new Error(`not a Google Fonts family (type ${meta.type})`);
      const licensePath = join(work, 'package/LICENSE');
      if (!existsSync(licensePath)) throw new Error('no LICENSE file in the package');
      const licenseText = readFileSync(licensePath, 'utf8');
      const key = meta.family.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenFamily.has(key)) throw new Error(`duplicate family ${meta.family}`);
      seenFamily.add(key);
      // pick files: latin subset, normal 400/700 (or the closest available), plus italic 400/700 where they exist
      const files = [];
      const have = (w, st) => existsSync(join(work, `package/files/${id}-latin-${w}-${st}.woff2`));
      const weights = meta.weights;
      const picks = [];
      for (const st of meta.styles) {
        const avail = weights.filter((w) => have(w, st));
        const chosen = (WEIGHT_OVERRIDES[id] ?? WANT_WEIGHTS).filter((w) => avail.includes(w));
        if (!chosen.length && avail.length) chosen.push(avail.includes(400) ? 400 : avail[0]);
        for (const w of chosen) picks.push([w, st]);
      }
      if (!picks.length) throw new Error('no latin woff2 files');
      const dest = join(outDir, id);
      rmSync(dest, { recursive: true, force: true }); mkdirSync(dest, { recursive: true });
      for (const [w, st] of picks) {
        const buf = readFileSync(join(work, `package/files/${id}-latin-${w}-${st}.woff2`));
        const name = `${id}-latin-${w}-${st}.woff2`;
        writeFileSync(join(dest, name), buf);
        files.push({ file: name, weight: w, style: st, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
      }
      writeFileSync(join(dest, 'LICENSE.txt'), licenseText);
      entries.push({
        id, family: meta.family, category: cat.id, fontsourceCategory: meta.category,
        weights: weights.filter((w) => files.some((f) => f.weight === w)), allWeights: weights, styles: [...new Set(files.map((f) => f.style))],
        files,
        source: `https://fontsource.org/fonts/${id} (Fontsource ${pkg.version}; Google Fonts, ${meta.source})`,
        sourceUrl: `https://fonts.google.com/specimen/${meta.family.replace(/ /g, '+')}`,
        licenseId: spdx, licenseName: ALLOWED[spdx].name, licenseUrl: meta.license?.url ?? ALLOWED[spdx].url, licenseFile: `fonts/${id}/LICENSE.txt`,
        copyright: meta.license?.attribution ?? '', redistributionPermitted: true, redistributionNote: ALLOWED[spdx].note,
        fontVersion: meta.version, dateChecked: today,
      });
    } catch (e) { problems.push(`${id}: ${e.message}`); }
  }
}
writeFileSync(join(root, 'src/vfx/fonts/catalog.json'), JSON.stringify({ generated: today, categories: CATEGORIES, families: entries }, null, 1));
console.log(`${entries.length} families written`);
for (const c of CATEGORIES) console.log(`  ${c.id.padEnd(10)} ${entries.filter((e) => e.category === c.id).length}`);
console.log('licences:', JSON.stringify(entries.reduce((m, e) => ((m[e.licenseId] = (m[e.licenseId] ?? 0) + 1), m), {})));
console.log('total font bytes:', entries.reduce((s, e) => s + e.files.reduce((a, f) => a + f.bytes, 0), 0));
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exitCode = 1; }
