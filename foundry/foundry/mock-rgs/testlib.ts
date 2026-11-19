// Test helper: write a tiny publication folder (index.json, books, lookup) from the real fixture books in foundry/spec/fixtures.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const FIXTURES = path.resolve(import.meta.dirname, '../spec/fixtures');

/** `weights` maps fixture file name (e.g. base_loss.json) to its weight; a weight of 0 keeps the book replayable but never drawn. */
export function writeFixtureLibrary(weights: Record<string, number>, mode = { name: 'base', cost: 1.0 }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockrgs-'));
  const books = Object.keys(weights).map((f) => JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8')));
  fs.writeFileSync(path.join(dir, `books_${mode.name}.jsonl`), books.map((b) => JSON.stringify(b)).join('\n') + '\n');
  fs.writeFileSync(
    path.join(dir, `lookUpTable_${mode.name}_0.csv`),
    Object.entries(weights).map(([f, w], i) => `${books[i].id},${w},${books[i].payoutMultiplier}`).join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify({ modes: [{ name: mode.name, cost: mode.cost, events: `books_${mode.name}.jsonl`, weights: `lookUpTable_${mode.name}_0.csv` }] }),
  );
  return dir;
}
