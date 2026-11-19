// Usage: npm run foundry:demo -- <web-sdk checkout> <compiled game dir> <math-sdk game library dir> [appName]
// Builds the sampled round data and the browser shim, then generates the game's frontend as a playable demo (no server needed).
import fs from 'node:fs';
import path from 'node:path';
import { buildSync } from 'esbuild';
import { buildFrontend } from '../compiler/frontend';
import { buildDemoData, sampleHit, sampleRtp } from './sample';

const [webSdk, gameDir, library, appName] = process.argv.slice(2);
if (!webSdk || !gameDir || !library) throw new Error('usage: demo-cli <web-sdk> <compiled game dir> <math-sdk game library dir> [appName]');
const manifest = JSON.parse(fs.readFileSync(path.join(gameDir, 'build-manifest.json'), 'utf8')) as { game: string };
const strings = JSON.parse(fs.readFileSync(path.join(gameDir, 'strings/en.json'), 'utf8')) as Record<string, string>;
const replayFile = path.join(gameDir, 'replay-events.json');
const forceIds = fs.existsSync(replayFile)
  ? Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(replayFile, 'utf8')) as Record<string, Record<string, number>>).map(([m, ids]) => [m, Object.values(ids)]))
  : {};

const data = await buildDemoData(path.join(library, 'publish_files'), { game: manifest.game, perBand: { base: 110, bonus: 45 }, forceIds });
for (const [m, d] of Object.entries(data.modes)) console.log(`demo ${m}: ${Object.keys(d.books).length} rounds kept, sample RTP ${(sampleRtp(d) * 100).toFixed(2)}%, hit rate ${(sampleHit(d) * 100).toFixed(2)}%`);

console.log(`demo data ${(JSON.stringify(data).length / 1e6).toFixed(1)} MB`);
const shim = buildSync({ entryPoints: [path.resolve(process.cwd(), 'foundry/demo/shim.ts')], bundle: true, write: false, format: 'iife', target: 'es2020', minify: true });
const r = buildFrontend({
  webSdk,
  gameDir,
  frontConfig: path.join(library, 'configs', `config_fe_${manifest.game}.json`),
  appName,
  demo: { dataJson: JSON.stringify(data), shimJs: shim.outputFiles[0].text, title: strings['meta.name'] ?? manifest.game },
});
console.log(`demo app ${r.appName} -> ${r.appDir}`);
console.log(`next: cd ${webSdk} && pnpm install --prefer-offline && pnpm run build --filter=${r.appName.replace(/_/g, '-')}`);
