/**
 * bangers CLI (Node 20+).
 *   bangers verify <bundle.zip> [--run-examples] [--json]
 *   bangers export-starter <out.zip> [--theme <id>] [--draft]
 *   bangers docs <out.md>
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportBundle } from '../core/bundle/export';
import { verifyBundle } from '../core/bundle/verify';
import { parameterReference } from '../core/docs';
import { createStarterProject, STARTER_IDS } from '../core/starter';
import { extractEntries, nodeExportEnv } from './nodeEnv';

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

const ICON = { pass: '✔', warn: '!', fail: '✘' } as const;

async function main(): Promise<number> {
  if (cmd === 'verify') {
    const file = argv[1];
    if (!file) { console.error('usage: bangers verify <bundle.zip> [--run-examples] [--json]'); return 2; }
    const bytes = new Uint8Array(readFileSync(file));
    const report = await verifyBundle(bytes);
    let exampleOk: boolean | null = null;
    let exampleOut = '';
    if (flag('--run-examples') && report.contents) {
      const dir = mkdtempSync(join(tmpdir(), 'bangers-bundle-'));
      extractEntries(report.contents.order, dir);
      const r = spawnSync(process.execPath, [join(dir, 'examples/node/replay.mjs')], { encoding: 'utf8' });
      exampleOk = r.status === 0;
      exampleOut = (r.stdout ?? '') + (r.stderr ?? '');
    }
    if (flag('--json')) console.log(JSON.stringify({ ok: report.ok && exampleOk !== false, checks: report.checks, example: exampleOk === null ? undefined : { ok: exampleOk, output: exampleOut } }, null, 2));
    else {
      for (const c of report.checks) {
        console.log(`${ICON[c.status]} ${c.label}\n    ${c.detail}`);
        for (const i of c.items ?? []) console.log(`      · ${i}`);
      }
      if (exampleOk !== null) console.log(`${exampleOk ? ICON.pass : ICON.fail} examples/node/replay.mjs ${exampleOk ? 'ran and replayed OK' : 'FAILED'}\n${exampleOut.split('\n').map((l) => `      ${l}`).join('\n')}`);
      console.log(report.ok && exampleOk !== false ? '\nBundle verified.' : '\nBundle FAILED verification.');
    }
    return report.ok && exampleOk !== false ? 0 : 1;
  }
  if (cmd === 'export-starter') {
    const out = argv[1];
    if (!out) { console.error('usage: bangers export-starter <out.zip> [--theme <id>] [--draft]'); return 2; }
    const project = createStarterProject();
    const res = await exportBundle(nodeExportEnv(project), { themeId: opt('--theme') ?? STARTER_IDS.classic, source: flag('--draft') ? 'draft' : 'approved' });
    writeFileSync(out, res.bytes);
    console.log(`wrote ${out} (${(res.bytes.length / 1024).toFixed(1)} KiB, ${res.entries.length} files)`);
    for (const w of res.warnings) console.log(`warning: ${w}`);
    return 0;
  }
  if (cmd === 'docs') {
    const out = argv[1];
    if (!out) { console.error('usage: bangers docs <out.md>'); return 2; }
    writeFileSync(out, parameterReference() + '\n');
    console.log(`wrote ${out}`);
    return 0;
  }
  console.error('commands: docs <out.md> | verify <bundle.zip> [--run-examples] [--json] | export-starter <out.zip> [--theme <id>] [--draft]');
  return 2;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
