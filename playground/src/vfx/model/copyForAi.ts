/**
 * "Copy for AI Coding": a precise, self-contained description of a preset, built from its FINAL settings, so an AI assistant (or a
 * person) can recreate or integrate exactly this effect: which preset, which fonts and licences, every number of the look and the
 * motion, every effect setting (defaults included), the timing, and the runtime call that plays it.
 */
import { MOTION_BY_ID } from '../anim/motions';
import { effectById } from '../fx';
import { BOARD_PARAMS, boardDefaults } from './board';
import { defaultsOf } from '../fx/effect';
import { getFamily } from '../fonts/catalog';
import { buildFontManifest } from '../fonts/manifest';
import type { CustomFontMeta } from '../fonts/service';
import type { Gradient } from '../style/gradient';
import { sortedStops } from '../style/gradient';
import type { ShapeStyle } from '../style/textStyle';
import { categoryDef, presetRef, type Preset } from './preset';
import { sceneFonts, type FxLayer, type MotionSpec, type SceneElement } from './scene';

const n = (v: number): string => String(Math.round(v * 10000) / 10000);

export function describeGradient(g: Gradient): string {
  const stops = sortedStops(g).map((s) => `${s.color}${s.alpha < 1 ? `@${n(s.alpha)}` : ''} at ${n(s.pos * 100)}%`).join(', ');
  const parts: string[] = [g.kind];
  if (g.kind === 'linear' || g.kind === 'reflected' || g.kind === 'conic') parts.push(`angle ${n(g.angle)}°`);
  if (g.kind !== 'linear' && g.kind !== 'solid') parts.push(`centre ${n(g.cx)}, ${n(g.cy)}`);
  if (g.kind === 'radial') parts.push(`radius ${n(g.radius)}`);
  if (g.scale !== 1) parts.push(`scale ${n(g.scale)}`);
  if (g.repeat !== 1) parts.push(`repeat ${n(g.repeat)}${g.reflect ? ' (mirrored)' : ''}`); else if (g.reflect) parts.push('mirrored repeats');
  if (g.phase) parts.push(`phase ${n(g.phase)}`);
  if (g.wave && g.wave.amount) parts.push(`wavy ${n(g.wave.amount * 100)}% × ${n(g.wave.count)} ripples${g.wave.speed ? ` travelling ${n(g.wave.speed)}/s` : ''}`);
  if (g.anim.enabled) parts.push(`animated ${n(g.anim.speed)} cycles/s ${g.anim.direction} ${g.anim.loop}`);
  return `${parts.join(', ')}; stops: ${stops}`;
}

function describeStyle(st: ShapeStyle, indent: string): string[] {
  const out = [`${indent}- face: ${describeGradient(st.face)}`];
  st.outlines.filter((o) => o.enabled).forEach((o, i) => out.push(`${indent}- outline ${i + 1}: ${n(o.width)} em, ${o.join} joins, ${describeGradient(o.fill)}`));
  if (st.bevel.enabled) out.push(`${indent}- bevel: size ${n(st.bevel.size)} em, depth ${n(st.bevel.depth)}, light from ${n(st.bevel.angle)}°, light ${st.bevel.light}, shade ${st.bevel.shade}`);
  if (st.innerHighlight.enabled) out.push(`${indent}- inner highlight: ${st.innerHighlight.color} @${n(st.innerHighlight.alpha)}, size ${n(st.innerHighlight.size)} em, from ${n(st.innerHighlight.angle)}°`);
  if (st.extrusion.enabled) out.push(`${indent}- extrusion: depth ${n(st.extrusion.depth)} em at ${n(st.extrusion.angle)}°, shade ${n(st.extrusion.shade)}, ${describeGradient(st.extrusion.fill)}`);
  if (st.shadow.enabled) out.push(`${indent}- shadow: ${st.shadow.color} @${n(st.shadow.alpha)}, blur ${n(st.shadow.blur)} em, offset ${n(st.shadow.dx)}, ${n(st.shadow.dy)} em`);
  if (st.glow.enabled) out.push(`${indent}- glow: radius ${n(st.glow.radius)} em, strength ${n(st.glow.strength)}, ${st.glow.bloom ? 'feeds bloom' : 'plain halo'}, ${describeGradient(st.glow.fill)}`);
  return out;
}

function describeSpec(slot: string, m: MotionSpec): string {
  const def = MOTION_BY_ID.get(m.id);
  const params = Object.entries(m.params).map(([k, v]) => `${k}=${String(v)}`).join(', ');
  return `  - ${slot}: \`${m.id}\` (${def?.name ?? 'unknown'}) start ${n(m.start)} s, duration ${n(m.duration)} s, unit ${m.unit}${m.stagger ? `, stagger ${n(m.stagger)} s ${m.order}` : ''}${m.amount !== 1 ? `, amount ${n(m.amount)}` : ''}${m.repeat ? `, ${m.repeat} cycles` : ''}${params ? `, ${params}` : ''}`;
}

function describeElement(e: SceneElement): string[] {
  const out = [`### ${e.name} (\`${e.id}\`, ${e.kind})`, `- position ${n(e.x)}, ${n(e.y)} (fractions of the stage width / height), scale ${n(e.scale)}, rotation ${n(e.rotation)}°, opacity ${n(e.opacity)}, appears at ${n(e.start)} s${e.end !== undefined ? `, removed at ${n(e.end)} s` : ''}`];
  if (e.kind === 'text') {
    const f = getFamily(e.style.font.id);
    out.push(`- text: ${JSON.stringify(e.text)}`, `- font: ${f ? `${f.family} (id \`${f.id}\`, ${f.licenseId})` : e.style.font.id} weight ${e.style.font.weight} ${e.style.font.style}, size ${n(e.size)} of the stage height, letter spacing ${n(e.style.letterSpacing)} em, line spacing ${n(e.style.lineSpacing)}, ${e.style.align}-aligned${e.style.uppercase ? ', upper case' : ''}${e.maxWidth ? `, wraps at ${n(e.maxWidth)} of the stage width` : ''}`);
    out.push(...describeStyle(e.style, ''));
  } else if (e.kind === 'counter') {
    const f = getFamily(e.style.font.id);
    out.push(`- counts from ${e.from} to ${e.to}${e.decimals ? ` with ${e.decimals} decimals` : ''}, prefix ${JSON.stringify(e.prefix)}, suffix ${JSON.stringify(e.suffix)}, thousands separator ${JSON.stringify(e.group)}, begins ${n(e.countStart)} s after appearing and takes ${n(e.countDuration)} s (${e.ease}), digits ${e.roll}${e.tickPop ? `, tick pop ${n(e.tickPop)}` : ''}${e.landPulse ? `, landing pulse ${n(e.landPulse)}` : ''}`);
    out.push(`- font: ${f ? `${f.family} (id \`${f.id}\`, ${f.licenseId})` : e.style.font.id} weight ${e.style.font.weight}, size ${n(e.size)} of the stage height`, ...describeStyle(e.style, ''));
  } else if (e.kind === 'image') {
    out.push(`- image asset \`${e.asset}\` (${e.role}), ${e.width ? `stretched to ${n(e.width)} × ${n(e.height ?? 0)} stage heights` : `longest side ${n(e.size)} of the stage height`}, look ${e.look}${e.gradient ? `: ${describeGradient(e.gradient)}` : ''}${e.playback === 'once' ? ', video plays once' : ''}`);
    if (e.outline) out.push(...describeStyle(e.outline, ''));
  } else if (e.kind === 'board') {
    const P = { ...boardDefaults(), ...e.params };
    out.push(`- reel board ${e.cols} reels × ${e.rows} rows, cell ${n(e.cell)} stage heights, gap ${n(e.gap)} of a cell${e.frame ? `, tile \`${e.frame}\` behind every cell` : ''}${e.panel ? `, panel \`${e.panel}\` behind the board` : ''}`);
    out.push(`- symbols (index: asset, role): ${e.symbols.map((x, i) => `${i}: \`${x.asset}\` (${x.name}, ${x.role}${x.expand ? `; while it expands it plays \`${x.expand.asset}\`, ${x.expand.fit === 'fill' ? 'filling the whole reel from the start' : 'growing with the wild from one cell to the whole reel'}, ${x.expand.play === 'fit' ? 'fitted to the expansion time' : 'at its own speed'}` : ''})`).join('; ')}`);
    out.push(...BOARD_PARAMS.map((d) => `  - ${d.key} = ${String(P[d.key])}: ${d.label}`));
  } else {
    out.push(`- shape \`${e.shape}\` ${n(e.width)} × ${n(e.height)} stage heights${Object.keys(e.params).length ? `, ${JSON.stringify(e.params)}` : ''}`, ...describeStyle(e.style, ''));
  }
  const m = e.motion;
  const lines: string[] = [];
  if (m.entrance) lines.push(describeSpec('entrance', m.entrance));
  if (m.idle) lines.push(describeSpec('idle', m.idle));
  for (const x of m.emphasis ?? []) lines.push(describeSpec('emphasis', x));
  if (m.exit) lines.push(describeSpec('exit', m.exit));
  out.push(lines.length ? '- motion layers (they stack):' : '- motion: none', ...lines);
  if (e.shine?.enabled) out.push(`- shine: ${e.shine.color} band, angle ${n(e.shine.angle)}°, width ${n(e.shine.width)}, intensity ${n(e.shine.intensity)}, starts ${n(e.shine.start)} s, ${n(e.shine.duration)} s per sweep, ${e.shine.repeat ? `${e.shine.repeat} more every ${n(e.shine.interval)} s` : 'once'}${e.shine.bloom ? ', feeds bloom' : ''}`);
  return out;
}

function describeFx(l: FxLayer): string[] {
  const e = effectById(l.effect);
  if (!e) return [`- \`${l.effect}\` (unknown effect)`];
  const eff = { ...defaultsOf(e), ...l.params };
  const rows = e.params.map((d) => `    - ${d.key} = ${String(eff[d.key])}${d.kind === 'number' && d.unit && d.unit !== 'count' ? ` ${d.unit}` : ''}${l.params[d.key] === undefined ? ' (default)' : ''}: ${d.label}`);
  return [`- **${e.name}** \`${e.id}\`${l.enabled ? '' : ' (disabled)'} starts at ${n(l.start)} s, lasts ${n(e.duration(eff))} s${l.target ? `, works on \`${l.target}\`` : ''}${l.target2 ? ` → \`${l.target2}\`` : ''}${l.frame ? `, taking the frame \`${l.frame}\` along (frame and symbol are drawn as one picture and destroyed together)` : ''}`, ...(l.ramp ? [`  - colour ramp (gradient map: the effect's colours are replaced by the ramp's colour at their brightness): ${describeGradient(l.ramp)}`] : []), ...rows];
}

export interface CopyOptions { customs?: (id: string) => CustomFontMeta | undefined; duration?: number }

export function copyForAi(p: Preset, o: CopyOptions = {}): string {
  const cat = categoryDef(p.category);
  const fonts = buildFontManifest(sceneFonts(p.scene), { customs: o.customs });
  const L: string[] = [];
  L.push(`# BANGERS VFX preset: ${p.name}`, '', `- **Preset id:** \`${p.id}\``, `- **Version:** ${p.version}  (reference \`${presetRef(p)}\`)`, `- **Category:** ${cat.name}`, `- **Status:** ${p.status}${p.derivedFrom ? `, copied from \`${p.derivedFrom}\`` : ''}`, `- **What it does:** ${p.description}`);
  if (o.duration) L.push(`- **Length:** ${n(o.duration)} s`);
  if (p.scene.seamless) L.push('- **Seamless loop:** yes. The scene is an ambient background that restarts at once with no rest, so every movement repeats exactly after one loop length.');
  L.push(`- **Stage:** aspect ratio ${n(p.scene.aspect)} (x ∈ [0, ${n(p.scene.aspect)}], y ∈ [0, 1], 1 unit = the stage height; positions below are fractions of the stage width / height)`, '');
  L.push('## Use it in a game', '',
    'The preset is plain JSON. Play it with the BANGERS VFX player (`vfx-player.js`, no dependencies, WebGL2). Fonts and images are loaded from the files next to it; nothing is fetched from the internet.', '',
    '```js', "import { createVfxPlayer } from './vfx-player.js';", "const preset = await (await fetch('./preset.json')).json();", `const player = await createVfxPlayer(canvas, { preset, base: './' });`,
    'player.play();                       // or player.seek(seconds) to scrub',
    ...p.scene.elements.filter((e) => e.kind === 'text').slice(0, 1).map((e) => `player.setText('${e.id}', 'Your text');   // change a text element at run time`),
    ...p.scene.elements.filter((e) => e.kind === 'counter').slice(0, 1).map((e) => `player.setCounter('${e.id}', { from: 0, to: 12345 });`),
    'player.onEnd(() => { /* the effect finished */ });', '```', '',
    'Draw the canvas above the game. Screen distortions bend what is on the canvas; to bend the game itself pass `backdrop: <canvas or image>` and the player will distort it too.',
    ...(p.scene.fx.some((l) => effectById(l.effect)?.transition) ? ['', 'This preset is a **transition between two screens**: pass the screen it leaves as `backdrop` and the screen it leads to as `backdropTo` (canvases or images of the two screens; `player.setBackdropTo(...)` changes the second one). The player mixes the two and draws the fire, smoke, ice, glass or lasers on top; when the transition ends, the new screen stays up. In the playground the two pictures are only stand-ins and are never part of an export.'] : []),
    '');
  L.push('## Fonts and licences', '');
  if (!fonts.fonts.length) L.push('No fonts are used.');
  for (const f of fonts.fonts) L.push(`- **${f.family}**: weights ${f.includedWeights.join(', ')}; licence ${f.licenseId}${f.licenseUrl ? ` (${f.licenseUrl})` : ''}; source ${f.sourceUrl || f.source}; redistribution ${f.redistributionPermitted === true ? 'permitted' : f.redistributionPermitted === false ? 'NOT permitted' : 'is the uploader\'s responsibility'}; files ${f.includedFiles.map((x) => x.file).join(', ')}`);
  L.push('', '## Elements', '');
  for (const e of p.scene.elements) L.push(...describeElement(e), '');
  L.push('## Effects', '');
  if (!p.scene.fx.length) L.push('No effect layers.');
  for (const l of p.scene.fx) L.push(...describeFx(l));
  if (p.scene.sounds?.length) {
    L.push('', '## Your own sounds', '', `Sound files attached to moments of the scene; they play with it${p.scene.sound.builtin === false ? ', replacing the generated sounds' : ', on top of the generated sounds'}. The moment is a cue point: \`scene:start\`, \`scene:end\`, \`el:<element>:in\`, \`fx:<layer>:start|impact|end\` or \`board:<element>:<event>\`.`, '');
    for (const x of p.scene.sounds) L.push(`- \`${x.asset}\` “${x.name}” at cue \`${x.cue}\` ${x.offset >= 0 ? '+' : '−'} ${n(Math.abs(x.offset))} s, volume ${n(x.gain)}`);
  }
  if (p.scene.assets.length) { L.push('', '## Pictures and sounds', ''); for (const a of p.scene.assets) L.push(`- \`${a.id}\`: ${a.name} (${a.kind}, ${a.bytes} bytes, sha256 ${a.sha256.slice(0, 16)}…)`); }
  L.push('', '## Exact preset JSON', '', 'This is the source of truth; everything above is a reading of it.', '', '```json', JSON.stringify(p, null, 2), '```', '');
  return L.join('\n');
}
