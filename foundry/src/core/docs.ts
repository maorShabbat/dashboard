/** Generates docs/parameters.md from the parameter definitions, so the reference can never drift from the code. */
import { EFFECT_LIST } from './effects/registry';
import { CUES } from './cues';
import { type ParamDef, UNIT_LABEL, isRef } from './params';
import { LAYERS, TOKEN_SECTIONS, TOKEN_DEFS, groupBy } from './tokens';

const dflt = (d: ParamDef): string => (isRef(d.default) ? `→ \`${d.default.$ref}\`` : d.kind === 'color' ? `\`${d.default}\`` : d.kind === 'text' || d.kind === 'asset' ? (d.default === '' ? '_empty_' : `\`${d.default}\``) : `\`${String(d.default)}\``);
const range = (d: ParamDef): string => (d.kind === 'number' ? `${d.min} – ${d.max}` : d.kind === 'enum' ? d.options.map((o) => `\`${o.value}\``).join(' · ') : d.kind === 'boolean' ? 'on / off' : d.kind === 'text' ? `≤ ${d.maxLength} chars` : d.kind === 'color' ? 'hex colour or colour role' : d.kind === 'font' ? 'font id' : `${d.assetKind} asset id`);
const unit = (d: ParamDef): string => (d.kind === 'number' && d.unit ? UNIT_LABEL[d.unit] || d.unit : '');
const row = (d: ParamDef) => `| \`${d.key}\` | ${d.label} | ${dflt(d)} | ${range(d)} | ${unit(d)} | ${d.description.replace(/\|/g, '\\|')}${d.activeWhen ? ` _(only when \`${d.activeWhen.key}\` is ${d.activeWhen.values.map((v) => `\`${String(v)}\``).join(' / ')})_` : ''} |`;
const head = '| Key | Label | Default | Bounds / options | Unit | Description |\n|---|---|---|---|---|---|';

export function parameterReference(): string {
  const out: string[] = [
    '# Parameter reference', '',
    '> Generated from the parameter definitions by `npm run bangers -- docs docs/parameters.md`. A test fails when this file is out of date.', '',
    'Every adjustable value has a default, bounds, a unit and a description. Lengths in **% cell** are percentages of one board cell, so they scale with the board and viewport.', '',
    `## Theme tokens (${TOKEN_DEFS.length})`, '',
    'Layer 1 of the inheritance chain (BANGERS defaults). A theme overrides any of these keys.', '',
  ];
  for (const s of TOKEN_SECTIONS) {
    const defs = TOKEN_DEFS.filter((d) => d.section === s.id);
    out.push(`### ${s.label} (${defs.length})`, '', s.blurb, '');
    if (s.id === 'sound') {
      out.push(`${CUES.length} cues × 4 tokens (\`cue.<id>.enabled\`, \`.asset\`, \`.gain\` dB, \`.pitch\` semitones):`, '', '| Cue | Description |', '|---|---|', ...CUES.map((c) => `| \`${c.id}\` | ${c.description} |`), '');
      out.push(head, ...defs.filter((d) => d.key.startsWith(`cue.${CUES[0]!.id}.`)).map(row), '');
      continue;
    }
    if (s.id === 'layers') {
      out.push(`Layers (bottom to top by default): ${LAYERS.map((l) => `\`${l.id}\``).join(', ')}. Each has \`visible\`, \`opacity\`, \`blend\`, \`z\` and \`followsCamera\`:`, '', head, ...defs.filter((d) => d.key.startsWith('layer.backdrop.')).map(row), '');
      continue;
    }
    for (const [group, g] of groupBy(defs, (d) => d.group)) {
      if (g.length > 12) { out.push(`**${group}**`, '', head, ...g.map(row), ''); } else out.push(`**${group}**`, '', head, ...g.map(row), '');
    }
  }
  out.push(`## Effects (${EFFECT_LIST.length})`, '', 'Layers 2–4 of the chain: a theme can set defaults for any parameter below, a preset can override them, and a sequence clip can override them again for one instance.', '');
  for (const e of EFFECT_LIST) {
    out.push(`### ${e.label} (\`${e.type}\`)`, '', e.description, '', `Intensity family: \`${e.category}\` · default layer: ${e.defaultLayer ? `\`${e.defaultLayer}\`` : 'none (acts on the camera / cells)'} · default cue markers: ${e.defaultCues.length ? e.defaultCues.map((c) => `\`${c.cue}\`@${c.at} ms`).join(', ') : 'none'}`, '', head, ...e.params.map(row), '');
  }
  return out.join('\n');
}
