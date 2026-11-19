/** Text files written into every bundle: working integration examples and the README. */
import type { BundleManifest } from './types';

export const WEB_EXAMPLE_HTML = (name: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)} · BANGERS web example</title>
  <link rel="icon" href="data:,">
  <style>
    body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: #0e0820; color: #fff7e6; }
    main { max-width: 1100px; margin: 0 auto; padding: 16px; }
    canvas { width: 100%; height: auto; background: #000; border-radius: 8px; display: block; }
    .bar { display: flex; gap: 12px; align-items: center; margin: 12px 0; flex-wrap: wrap; }
    select, button { font: inherit; padding: 6px 10px; }
    pre { background: #1a1038; padding: 12px; border-radius: 8px; max-height: 220px; overflow: auto; margin: 0; }
    .ok { color: #3be88a; } .bad { color: #ff4d4d; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(name)}</h1>
    <canvas id="stage" width="1280" height="720"></canvas>
    <div class="bar">
      <label>Sequence <select id="seq"></select></label>
      <button id="replay" type="button">Replay</button>
      <label><input id="rm" type="checkbox"> Reduced motion</label>
      <span id="verify"></span>
    </div>
    <pre id="log">Loading…</pre>
  </main>
  <script type="module" src="./main.js"></script>
</body>
</html>
`;

export const WEB_EXAMPLE_JS = `// Serve the bundle folder over HTTP (modules cannot load from file://), e.g.:  python3 -m http.server 8080
import { loadBundle, prepareBundle, createBundlePlayer, verifyReplay } from '../../runtime/bangers-runtime.js';

const canvas = document.getElementById('stage');
const select = document.getElementById('seq');
const logEl = document.getElementById('log');
const lines = [];
const log = (m) => { lines.push(m); logEl.textContent = lines.slice(-60).join('\\n'); logEl.scrollTop = logEl.scrollHeight; };

const bundle = await loadBundle(new URL('../../', import.meta.url).href);
const prepared = await prepareBundle(bundle);          // registers bundled fonts, decodes images, sets up cue audio

// Self-check: recompute every replay fingerprint from this bundle's own config and compare with manifest.json.
const report = verifyReplay(bundle);
document.getElementById('verify').innerHTML = report.ok
  ? '<span class="ok">replay verified (' + report.compared + ' fingerprints)</span>'
  : '<span class="bad">replay MISMATCH</span>';
log('bundle: ' + bundle.manifest.name + ' · schema v' + bundle.manifest.schemaVersion + ' · package ' + bundle.manifest.packageVersion);

for (const s of bundle.library.sequences) select.add(new Option(s.name, s.id));

let player = null;
async function start(id) {
  player?.dispose();
  lines.length = 0;
  player = await createBundlePlayer({
    bundle, prepared, canvas, sequence: id, reducedMotion: document.getElementById('rm').checked,
    // Cues are named sounds; the runtime resolves theme gain/pitch/asset for you. Play them however your game plays audio.
    onCue: (e) => { log('cue    ' + e.name.padEnd(18) + ' @' + Math.round(e.t) + 'ms'); prepared.audio?.play(e); },
    // Events are for your game logic: e.g. unlock the spin button on 'celebration.end'.
    onEvent: (e) => { log('event  ' + e.name.padEnd(18) + ' @' + Math.round(e.t) + 'ms'); },
    onEnd: () => log('done'),
  });
  player.replay();
}

document.getElementById('replay').addEventListener('click', async () => { await prepared.audio?.resume(); player ? player.replay() : start(select.value); });
select.addEventListener('change', () => start(select.value));
document.getElementById('rm').addEventListener('change', () => start(select.value));
if (select.value) await start(select.value);

// Handy for automated checks.
window.__bangers = { ready: true, verify: report, sequences: bundle.library.sequences.map((s) => s.id), player: () => player, bundle };
`;

export const NODE_EXAMPLE = `// Headless replay + verification. Run:  node examples/node/replay.mjs
// Exits non-zero if the bundle does not replay exactly as recorded in manifest.json.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadBundle, verifyReplay, compileFromBundle, timelineEvents, evaluateFrame, assetIndexFrom } from '../../runtime/bangers-runtime.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = await loadBundle(async (path) => new Uint8Array(await readFile(root + path)));
const { manifest, library } = bundle;
console.log(\`\${manifest.name}  (bundle v\${manifest.bundleVersion}, schema v\${manifest.schemaVersion}, package \${manifest.packageVersion})\`);
console.log(\`theme "\${manifest.theme.name}" from \${manifest.theme.source}\${manifest.theme.approved ? ' (approved)' : ' (not approved)'}\`);

const assets = assetIndexFrom(bundle.mediaIndex);
for (const s of library.sequences) {
  const seq = compileFromBundle(bundle, { sequence: s.id });
  const events = timelineEvents(seq);
  const mid = evaluateFrame(seq, seq.duration / 2, { viewport: { w: 1280, h: 720 }, assets });
  console.log(\`- \${s.name}: \${Math.round(seq.duration)} ms, \${seq.clips.length} effect instances, \${events.length} cues/events, \${mid.ops.length} draw ops at midpoint\`);
  for (const e of events.filter((x) => x.kind === 'event')) console.log(\`    event \${e.name} @ \${Math.round(e.t)} ms\`);
}

const report = verifyReplay(bundle);
console.log(report.ok ? \`REPLAY OK: \${report.compared} fingerprints match\` : 'REPLAY MISMATCH');
for (const d of report.diffs) console.log(\`  \${d.scope} \${d.id}: \${d.detail}\`);
process.exit(report.ok ? 0 : 1);
`;

export const DOM_EXAMPLE_HTML = (name: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(name)} · DOM / CSS example</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="../../config/theme.css">
  <style>
    :root { --bangers-cell: 120px; }  /* set this from your board layout */
    body { margin: 0; padding: 24px; background: var(--bangers-color-background); color: var(--bangers-color-text); font-family: var(--bangers-type-body-family); }
    .plate {
      display: inline-block; padding: calc(var(--bangers-cell) * var(--bangers-surface-padding));
      border-radius: calc(var(--bangers-cell) * var(--bangers-surface-corner-radius));
      background: linear-gradient(calc(var(--bangers-surface-gradient-angle) * 1deg), var(--bangers-surface-fill), var(--bangers-surface-fill-alt));
      border: calc(var(--bangers-cell) * var(--bangers-outline-width)) solid var(--bangers-outline-color);
      box-shadow: 0 calc(var(--bangers-cell) * var(--bangers-depth-shadow-offset-y)) calc(var(--bangers-cell) * var(--bangers-depth-shadow-blur)) var(--bangers-depth-shadow-color);
    }
    h1 { margin: 0; font-family: var(--bangers-type-display-family); font-size: calc(var(--bangers-cell) * var(--bangers-type-display-size)); color: var(--bangers-color-win); text-transform: uppercase; }
    .swatches { display: flex; gap: 8px; margin-top: 16px; }
    .swatches i { width: 40px; height: 40px; border-radius: 6px; border: 2px solid var(--bangers-color-outline); }
  </style>
</head>
<body>
  <div class="plate"><h1>Big win</h1><p>Styled from <code>config/theme.css</code></p></div>
  <div class="swatches">
    <i style="background: var(--bangers-color-primary)"></i><i style="background: var(--bangers-color-secondary)"></i>
    <i style="background: var(--bangers-color-accent)"></i><i style="background: var(--bangers-color-win)"></i>
  </div>
</body>
</html>
`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function readme(m: BundleManifest, artDirection: string): string {
  const fontRows = m.fonts.map((f) => `| ${f.family} | ${f.origin} | ${f.bundled ? 'included' : '**not included**'} | ${f.license ?? 'n/a'} |`).join('\n') || '| none | | | |';
  const omitted = m.omitted.length ? m.omitted.map((o) => `- **${o.kind} ${o.name}**: ${o.reason}`).join('\n') : '- nothing omitted';
  return `# ${m.name}

Portable BANGERS theme bundle: theme **${m.theme.name}**${m.theme.version ? ` (${m.theme.version.label})` : ''}, ${m.presets.length} effect preset(s), ${m.sequences.length} sequence(s).

| | |
|---|---|
| Bundle layout version | ${m.bundleVersion} |
| Data schema version | ${m.schemaVersion} |
| Studio package version | ${m.packageVersion} |
| Runtime version | ${m.runtimeVersion} |
| Theme source | ${m.theme.source}${m.theme.approved ? ' (approved version)' : ' (NOT an approved version)'} |
| Created | ${m.createdAt} |

## What is inside

| Path | Purpose |
|---|---|
| \`manifest.json\` | Versions, file list with SHA-256, licences, omissions, recorded replay fingerprints |
| \`config/library.json\` | Theme, presets and sequences (the full inheritance chain: BANGERS defaults → theme → preset → instance) |
| \`config/tokens.json\`, \`config/theme.css\` | Flat resolved tokens for DOM/CSS styling |
| \`runtime/bangers-runtime.js\` | Zero-dependency ES module that replays everything |
| \`assets/\`, \`fonts/\` | Only files whose licence permits redistribution |
| \`licenses/\`, \`LICENSES.md\` | Licence texts and attributions |
| \`examples/web\`, \`examples/node\`, \`examples/dom-css\` | Working integrations |
| \`checksums.sha256\` | \`sha256sum -c\`-compatible checksums |

## Try it

\`\`\`bash
node examples/node/replay.mjs          # headless: replays and verifies against manifest.json
python3 -m http.server 8080            # then open http://localhost:8080/examples/web/
\`\`\`

## Integrate

\`\`\`js
import { loadBundle, prepareBundle, createBundlePlayer } from './runtime/bangers-runtime.js';

const bundle = await loadBundle('/path/to/this/folder/');
const prepared = await prepareBundle(bundle);          // fonts, images, audio
const player = await createBundlePlayer({
  bundle, prepared, canvas, sequence: '${m.sequences[0]?.id ?? 'sequence-id'}',
  onCue: (cue) => prepared.audio?.play(cue),           // sound cues with theme gain / pitch / asset applied
  onEvent: (e) => { if (e.name === 'celebration.end') unlockSpin(); },
});
player.replay();                 // also: play(), pause(), seek(ms), loop, speed
\`\`\`

Pass \`reducedMotion: true\` to honour the user's accessibility setting (scales shake, flash, motion and particles by the theme's reduced-motion factor). Effect parameters are in board-relative units, so the same bundle renders proportionally on any board size / viewport: set the canvas size and the runtime derives the cell size.

## Verification

\`manifest.json → replay\` stores SHA-256 fingerprints of the rendered display list at ${m.replay.sequences ? Object.values(m.replay.sequences)[0]?.viewports[0]?.samples.length ?? 9 : 9} points of every sequence (${m.replay.viewports.join(' + ')} viewports), of every preset, and of each of the ${Object.keys(m.replay.effects).length} required effects resolved through the theme. \`verifyReplay(bundle)\` recomputes them from the shipped config; any difference means the bundle was altered or the runtime changed behaviour.

## Fonts

| Family | Origin | Files | Licence |
|---|---|---|---|
${fontRows}

## Omitted

${omitted}

## Licences

See \`LICENSES.md\` and \`licenses/\`. Fonts and assets are only bundled when their declared licence allows redistribution.

## Art direction (documentation only)

${artDirection || '_none recorded_'}

> The theme description and art-direction notes document intent. They are **not** read by the renderer: every visual comes from the explicit, bounded parameters in \`config/library.json\`.
`;
}
