/** The pictures that ship with the playground: four hand-made icons plus icons and message backgrounds drawn in code. */
import type { ImageLibrary } from '../player/assets';

type G = CanvasRenderingContext2D;
const mk = (w: number, h: number): [HTMLCanvasElement, G] => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!]; };
const toBlob = (c: HTMLCanvasElement): Promise<Blob> => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
const lin = (g: G, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient => { const q = g.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) q.addColorStop(o, c); return q; };
const rad = (g: G, x: number, y: number, r0: number, r1: number, stops: [number, string][]): CanvasGradient => { const q = g.createRadialGradient(x, y, r0, x, y, r1); for (const [o, c] of stops) q.addColorStop(o, c); return q; };

const icon = (draw: (g: G) => void) => async (): Promise<Blob> => { const [c, g] = mk(256, 256); draw(g); return toBlob(c); };

function heartPath(g: G, cx: number, cy: number, s: number): void {
  g.beginPath(); g.moveTo(cx, cy + s * 0.85);
  g.bezierCurveTo(cx - s * 1.35, cy + s * 0.05, cx - s * 0.95, cy - s * 0.95, cx, cy - s * 0.35);
  g.bezierCurveTo(cx + s * 0.95, cy - s * 0.95, cx + s * 1.35, cy + s * 0.05, cx, cy + s * 0.85); g.closePath();
}

const ICONS: Record<string, (g: G) => void> = {
  coin(g) {
    g.fillStyle = lin(g, 40, 30, 216, 226, [[0, '#fff3a6'], [0.5, '#ffc933'], [1, '#a8620a']]); g.beginPath(); g.arc(128, 128, 104, 0, 7); g.fill();
    g.strokeStyle = '#7a4306'; g.lineWidth = 8; g.stroke();
    g.fillStyle = lin(g, 60, 50, 200, 210, [[0, '#ffd968'], [1, '#e29a15']]); g.beginPath(); g.arc(128, 128, 80, 0, 7); g.fill();
    g.strokeStyle = '#b87612'; g.lineWidth = 5; g.stroke();
    g.fillStyle = lin(g, 0, 70, 0, 190, [[0, '#fff6c2'], [1, '#c98615']]); g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 24 : 54; g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g.closePath(); g.fill();
    g.strokeStyle = '#8a5208'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 94, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
  },
  crown(g) {
    g.beginPath(); g.moveTo(34, 196); g.lineTo(22, 80); g.lineTo(84, 130); g.lineTo(128, 50); g.lineTo(172, 130); g.lineTo(234, 80); g.lineTo(222, 196); g.closePath();
    g.fillStyle = lin(g, 0, 50, 0, 200, [[0, '#fff0a0'], [0.5, '#ffc933'], [1, '#b8730a']]); g.fill(); g.strokeStyle = '#6b3a05'; g.lineWidth = 8; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = lin(g, 0, 170, 0, 214, [[0, '#ffd24a'], [1, '#a8620a']]); g.beginPath(); g.roundRect(30, 172, 196, 40, 10); g.fill(); g.stroke();
    for (const [x, y] of [[22, 76], [128, 44], [234, 76]] as const) { g.fillStyle = rad(g, x - 4, y - 4, 2, 16, [[0, '#ffffff'], [1, '#ffb400']]); g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill(); g.stroke(); }
    for (const [x, c] of [[70, '#4ad8ff'], [128, '#ff4a6a'], [186, '#7bff7a']] as const) { g.fillStyle = rad(g, x - 4, 186, 1, 14, [[0, '#ffffff'], [1, c]]); g.beginPath(); g.arc(x, 192, 13, 0, 7); g.fill(); g.lineWidth = 4; g.stroke(); }
  },
  cherry(g) {
    g.strokeStyle = '#3f7a1d'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(88, 150); g.quadraticCurveTo(100, 70, 156, 28); g.moveTo(170, 160); g.quadraticCurveTo(160, 80, 156, 28); g.stroke();
    g.fillStyle = lin(g, 0, 20, 0, 70, [[0, '#7ce04a'], [1, '#2c8a1a']]); g.beginPath(); g.moveTo(156, 30); g.quadraticCurveTo(210, 10, 232, 56); g.quadraticCurveTo(190, 70, 156, 30); g.fill(); g.strokeStyle = '#1f5a10'; g.lineWidth = 4; g.stroke();
    for (const [x, y] of [[84, 170], [172, 180]] as const) {
      g.fillStyle = rad(g, x - 18, y - 22, 4, 66, [[0, '#ff8a9a'], [0.35, '#e0102c'], [1, '#7a0518']]); g.beginPath(); g.arc(x, y, 58, 0, 7); g.fill(); g.strokeStyle = '#4a020f'; g.lineWidth = 6; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(x - 20, y - 24, 12, 7, -0.6, 0, 7); g.fill();
    }
  },
  bell(g) {
    g.beginPath(); g.moveTo(128, 30); g.bezierCurveTo(70, 30, 62, 96, 56, 140); g.bezierCurveTo(52, 170, 34, 176, 28, 192); g.lineTo(228, 192); g.bezierCurveTo(222, 176, 204, 170, 200, 140); g.bezierCurveTo(194, 96, 186, 30, 128, 30); g.closePath();
    g.fillStyle = lin(g, 40, 0, 220, 0, [[0, '#b8730a'], [0.35, '#ffe27a'], [0.6, '#ffc933'], [1, '#9a5a08']]); g.fill(); g.strokeStyle = '#6b3a05'; g.lineWidth = 8; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = lin(g, 0, 176, 0, 208, [[0, '#ffd24a'], [1, '#a8620a']]); g.beginPath(); g.roundRect(24, 184, 208, 24, 12); g.fill(); g.stroke();
    g.fillStyle = rad(g, 120, 220, 2, 24, [[0, '#ffe27a'], [1, '#a8620a']]); g.beginPath(); g.arc(128, 222, 22, 0, 7); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(100, 100, 10, 40, 0.2, 0, 7); g.fill();
    g.fillStyle = '#ffc933'; g.beginPath(); g.arc(128, 26, 12, 0, 7); g.fill(); g.stroke();
  },
  clover(g) {
    const leaf = (a: number) => { g.save(); g.translate(128, 120); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-52, -20, -58, -84, -22, -92); g.bezierCurveTo(-8, -96, 0, -84, 0, -72); g.bezierCurveTo(0, -84, 8, -96, 22, -92); g.bezierCurveTo(58, -84, 52, -20, 0, 0); g.closePath();
      g.fillStyle = lin(g, 0, -96, 0, 0, [[0, '#a4f26a'], [1, '#1f9a2a']]); g.fill(); g.strokeStyle = '#0f5a18'; g.lineWidth = 6; g.lineJoin = 'round'; g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -66); g.stroke(); g.restore(); };
    g.strokeStyle = '#1f7a1c'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 120); g.quadraticCurveTo(140, 190, 176, 226); g.stroke();
    for (let i = 0; i < 4; i++) leaf((i * Math.PI) / 2 + Math.PI / 4);
  },
  heart(g) {
    heartPath(g, 128, 118, 84); g.fillStyle = lin(g, 0, 40, 0, 210, [[0, '#ff8a9a'], [0.45, '#f0173a'], [1, '#8a0620']]); g.fill(); g.strokeStyle = '#4a020f'; g.lineWidth = 8; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.65)'; g.beginPath(); g.ellipse(84, 84, 22, 12, -0.7, 0, 7); g.fill();
  },
};

const BACKS: Record<string, (g: G, w: number, h: number) => void> = {
  'reel-panel'(g, w, h) {
    g.fillStyle = lin(g, 0, 0, 0, h, [[0, '#fff0a0'], [0.5, '#e8a21a'], [1, '#7a4306']]); g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 52); g.fill(); g.strokeStyle = '#3f1d03'; g.lineWidth = 12; g.stroke();
    g.fillStyle = lin(g, 0, 0, 0, h, [[0, '#2a1560'], [1, '#0f0830']]); g.beginPath(); g.roundRect(34, 34, w - 68, h - 68, 34); g.fill(); g.strokeStyle = '#ffd24a'; g.lineWidth = 5; g.stroke();
    for (const [x, y] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]] as const) { g.fillStyle = rad(g, x - 3, y - 3, 1, 14, [[0, '#ffffff'], [1, '#ffb400']]); g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); g.strokeStyle = '#6b3a05'; g.lineWidth = 3; g.stroke(); }
  },
  'plate-gold'(g, w, h) {
    g.fillStyle = lin(g, 0, 0, 0, h, [[0, '#fff0a0'], [0.5, '#e8a21a'], [1, '#7a4306']]); g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 70); g.fill(); g.strokeStyle = '#3f1d03'; g.lineWidth = 10; g.stroke();
    g.fillStyle = lin(g, 0, 0, 0, h, [[0, '#3b1d6a'], [1, '#1a0a3a']]); g.beginPath(); g.roundRect(50, 50, w - 100, h - 100, 44); g.fill(); g.strokeStyle = '#ffd24a'; g.lineWidth = 6; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.roundRect(60, 58, w - 120, (h - 116) * 0.42, 36); g.fill();
    for (const [x, y] of [[44, 44], [w - 44, 44], [44, h - 44], [w - 44, h - 44]] as const) { g.fillStyle = rad(g, x - 4, y - 4, 2, 20, [[0, '#ffffff'], [1, '#ffb400']]); g.beginPath(); g.arc(x, y, 18, 0, 7); g.fill(); g.strokeStyle = '#6b3a05'; g.lineWidth = 4; g.stroke(); }
  },
  'ribbon-red'(g, w, h) {
    g.fillStyle = lin(g, 0, 0, 0, h, [[0, '#ff7a6a'], [0.5, '#d6283a'], [1, '#8d0f26']]); g.beginPath(); g.moveTo(10, 40); g.lineTo(w - 10, 40); g.lineTo(w - 120, h / 2); g.lineTo(w - 10, h - 40); g.lineTo(10, h - 40); g.lineTo(120, h / 2); g.closePath(); g.fill();
    g.strokeStyle = '#3f0614'; g.lineWidth = 10; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(130, 54, w - 260, (h - 108) * 0.38);
  },
  'frame-neon'(g, w, h) {
    g.fillStyle = 'rgba(8,14,34,0.88)'; g.beginPath(); g.roundRect(24, 24, w - 48, h - 48, 60); g.fill();
    g.shadowColor = '#38e8ff'; g.shadowBlur = 28; g.strokeStyle = '#bff8ff'; g.lineWidth = 12; g.stroke(); g.shadowBlur = 0;
    g.strokeStyle = '#38e8ff'; g.lineWidth = 4; g.beginPath(); g.roundRect(52, 52, w - 104, h - 104, 38); g.stroke();
  },
};

/** Square symbol tiles (the cell a slot symbol sits in), transparent outside the rounded corners. */
const TILES: Record<string, (g: G, s: number) => void> = {
  'tile-dark'(g, s) {
    g.fillStyle = 'rgba(16,10,40,0.9)'; g.beginPath(); g.roundRect(14, 14, s - 28, s - 28, 54); g.fill();
    g.strokeStyle = 'rgba(190,170,255,0.45)'; g.lineWidth = 8; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.roundRect(26, 24, s - 52, (s - 48) * 0.42, 40); g.fill();
  },
  'tile-gold'(g, s) {
    g.fillStyle = lin(g, 0, 0, 0, s, [[0, '#fff0a0'], [0.5, '#e8a21a'], [1, '#7a4306']]); g.beginPath(); g.roundRect(12, 12, s - 24, s - 24, 64); g.fill(); g.strokeStyle = '#3f1d03'; g.lineWidth = 12; g.stroke();
    g.fillStyle = lin(g, 0, 0, 0, s, [[0, '#4a2a86'], [1, '#1c0b3d']]); g.beginPath(); g.roundRect(46, 46, s - 92, s - 92, 38); g.fill(); g.strokeStyle = '#ffd24a'; g.lineWidth = 6; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.roundRect(56, 54, s - 112, (s - 108) * 0.4, 30); g.fill();
    for (const [x, y] of [[40, 40], [s - 40, 40], [40, s - 40], [s - 40, s - 40]] as const) { g.fillStyle = rad(g, x - 4, y - 4, 2, 18, [[0, '#ffffff'], [1, '#ffb400']]); g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); g.strokeStyle = '#6b3a05'; g.lineWidth = 4; g.stroke(); }
  },
  'tile-green'(g, s) {
    g.fillStyle = lin(g, 0, 0, 0, s, [[0, '#c8ff6a'], [0.5, '#35c431'], [1, '#0b6a26']]); g.beginPath(); g.roundRect(12, 12, s - 24, s - 24, 70); g.fill(); g.strokeStyle = '#032a0e'; g.lineWidth = 14; g.stroke();
    g.fillStyle = lin(g, 0, 0, 0, s, [[0, '#1a5a3a'], [1, '#062a1c']]); g.beginPath(); g.roundRect(44, 44, s - 88, s - 88, 44); g.fill(); g.strokeStyle = '#e9ff9a'; g.lineWidth = 5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.roundRect(54, 52, s - 108, (s - 104) * 0.38, 34); g.fill();
  },
  'tile-blue'(g, s) {
    g.fillStyle = lin(g, 0, 0, 0, s, [[0, '#f2fcff'], [0.45, '#8fd2ff'], [1, '#2a5fc4']]); g.beginPath(); g.roundRect(12, 12, s - 24, s - 24, 56); g.fill(); g.strokeStyle = '#0c2352'; g.lineWidth = 12; g.stroke();
    g.fillStyle = lin(g, 0, 0, 0, s, [[0, '#1b4690'], [1, '#081a44']]); g.beginPath(); g.roundRect(44, 44, s - 88, s - 88, 34); g.fill(); g.strokeStyle = '#e6faff'; g.lineWidth = 5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.roundRect(54, 52, s - 108, (s - 104) * 0.4, 28); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { const o = 70 + i * 24; g.beginPath(); g.moveTo(24 + i * 6, o); g.lineTo(24 + i * 6 + 30, o + 30); g.stroke(); g.beginPath(); g.moveTo(s - 24 - i * 6, s - o); g.lineTo(s - 54 - i * 6, s - o - 30); g.stroke(); }
  },
  'tile-wood'(g, s) {
    g.fillStyle = lin(g, 0, 0, s, s, [[0, '#c98a4a'], [0.5, '#8d5326'], [1, '#5a3014']]); g.beginPath(); g.roundRect(12, 12, s - 24, s - 24, 40); g.fill(); g.strokeStyle = '#2b1408'; g.lineWidth = 12; g.stroke();
    g.strokeStyle = 'rgba(40,18,6,0.35)'; g.lineWidth = 2; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(24, 40 + i * 36); g.bezierCurveTo(s * 0.3, 30 + i * 36, s * 0.6, 56 + i * 36, s - 24, 40 + i * 36); g.stroke(); }
    g.fillStyle = lin(g, 0, 0, 0, s, [[0, '#f6e6bf'], [1, '#d9bf8a']]); g.beginPath(); g.roundRect(54, 54, s - 108, s - 108, 20); g.fill(); g.strokeStyle = '#2b1408'; g.lineWidth = 8; g.stroke();
    for (const [x, y] of [[34, 34], [s - 34, 34], [34, s - 34], [s - 34, s - 34]] as const) { g.fillStyle = rad(g, x - 3, y - 3, 1, 12, [[0, '#e8e8e8'], [1, '#6a6a6a']]); g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill(); }
  },
  'tile-neon'(g, s) {
    g.fillStyle = 'rgba(10,8,30,0.92)'; g.beginPath(); g.roundRect(22, 22, s - 44, s - 44, 54); g.fill();
    g.shadowColor = '#ff3df2'; g.shadowBlur = 30; g.strokeStyle = '#ffd1fb'; g.lineWidth = 12; g.stroke(); g.shadowBlur = 0;
    g.shadowColor = '#38e8ff'; g.shadowBlur = 20; g.strokeStyle = '#38e8ff'; g.lineWidth = 4; g.beginPath(); g.roundRect(54, 54, s - 108, s - 108, 30); g.stroke(); g.shadowBlur = 0;
  },
};

export function registerBuiltins(images: ImageLibrary, urls: { gem: string; horseshoe: string; star: string; seven: string }, expansions: Record<string, string> = {}): void {
  for (const [k, u] of Object.entries(urls)) images.registerBuiltin(k, u);
  for (const [k, u] of Object.entries(expansions)) images.registerBuiltin(k, u);
  for (const [k, d] of Object.entries(ICONS)) images.registerGenerated(k, icon(d));
  for (const [k, d] of Object.entries(BACKS)) images.registerGenerated(k, async () => { const [c, g] = mk(1024, 512); d(g, 1024, 512); return toBlob(c); });
  for (const [k, d] of Object.entries(TILES)) images.registerGenerated(k, async () => { const [c, g] = mk(512, 512); d(g, 512); return toBlob(c); });
}

export const BUILTIN_ICONS: { id: string; name: string }[] = [
  { id: 'builtin:gem', name: 'Gem' }, { id: 'builtin:horseshoe', name: 'Horseshoe' }, { id: 'builtin:star', name: 'Star' }, { id: 'builtin:seven', name: 'Lucky seven' },
  { id: 'builtin:coin', name: 'Coin' }, { id: 'builtin:crown', name: 'Crown' }, { id: 'builtin:cherry', name: 'Cherries' }, { id: 'builtin:bell', name: 'Bell' },
  { id: 'builtin:clover', name: 'Clover' }, { id: 'builtin:heart', name: 'Heart' },
];
export const BUILTIN_BACKGROUNDS: { id: string; name: string }[] = [
  { id: 'builtin:plate-gold', name: 'Gold plate' }, { id: 'builtin:ribbon-red', name: 'Red ribbon' }, { id: 'builtin:frame-neon', name: 'Neon frame' },
  { id: 'builtin:reel-panel', name: 'Reel panel' }, { id: 'builtin:tile-dark', name: 'Tile: dark glass' }, { id: 'builtin:tile-gold', name: 'Tile: gold' }, { id: 'builtin:tile-green', name: 'Tile: green' }, { id: 'builtin:tile-blue', name: 'Tile: ice blue' }, { id: 'builtin:tile-wood', name: 'Tile: wood' }, { id: 'builtin:tile-neon', name: 'Tile: neon' },
];

/**
 * The animations that ship for a wild to play while it expands over its reel: transparent WebM files, each one reel tall, made with the
 * playground's own effects (tools/playground/make-expansions.mjs). Their names end in .webm so they are known as video wherever they are read.
 */
export const BUILTIN_EXPANSIONS: { id: string; name: string }[] = [
  { id: 'builtin:wild-fire-column.webm', name: 'Pillar of fire' },
  { id: 'builtin:wild-lightning-column.webm', name: 'Pillar of lightning' },
  { id: 'builtin:wild-gold-column.webm', name: 'Pillar of golden light' },
  { id: 'builtin:wild-plasma-column.webm', name: 'Plasma helix' },
];
