/** Stand-in pictures behind the effect, so distortions and impacts have something to bend. The exported player never includes them. */
export type BackdropId = 'barn' | 'reels' | 'night' | 'daylight' | 'bonus' | 'lava' | 'none';
export const BACKDROP_IDS: BackdropId[] = ['barn', 'reels', 'night', 'daylight', 'bonus', 'lava', 'none'];
export const BACKDROPS: { id: BackdropId; name: string }[] = [
  { id: 'barn', name: 'Barn at night' },
  { id: 'reels', name: 'Slot reels' },
  { id: 'night', name: 'Dark blue' },
  { id: 'daylight', name: 'Daylight' },
  { id: 'bonus', name: 'Bonus round' },
  { id: 'lava', name: 'Lava cave' },
  { id: 'none', name: 'Transparent' },
];

const W = 1600, H = 900;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return [c, c.getContext('2d')!];
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}

export function drawReels(): HTMLCanvasElement {
  const [c, g] = canvas();
  const bg = g.createRadialGradient(W / 2, H * 0.45, 80, W / 2, H / 2, W * 0.75);
  bg.addColorStop(0, '#3b2570'); bg.addColorStop(1, '#0d0a22');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const cols = 5, rows = 3, cw = 232, ch = 232, gap = 18;
  const x0 = (W - (cols * cw + (cols - 1) * gap)) / 2, y0 = (H - (rows * ch + (rows - 1) * gap)) / 2;
  const palette: [string, string][] = [['#ff5a7a', '#a0123c'], ['#ffd34a', '#c27a00'], ['#4ad8ff', '#0a64c8'], ['#7bff7a', '#128a2a'], ['#d27bff', '#6a1aa8']];
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = x0 + k * (cw + gap), y = y0 + r * (ch + gap);
    g.fillStyle = 'rgba(12,8,36,0.82)'; g.beginPath(); g.roundRect(x, y, cw, ch, 26); g.fill();
    g.strokeStyle = 'rgba(160,140,255,0.28)'; g.lineWidth = 3; g.stroke();
    const [a, b] = palette[(r * 2 + k * 3) % palette.length]!;
    const gg = g.createLinearGradient(0, y + 40, 0, y + ch - 40); gg.addColorStop(0, a); gg.addColorStop(1, b);
    g.fillStyle = gg;
    const cx = x + cw / 2, cy = y + ch / 2, kind = (r + k * 2) % 4;
    if (kind === 0) { g.beginPath(); g.moveTo(cx, cy - 78); g.lineTo(cx + 66, cy - 8); g.lineTo(cx, cy + 82); g.lineTo(cx - 66, cy - 8); g.closePath(); g.fill(); }
    else if (kind === 1) { g.beginPath(); g.arc(cx - 34, cy + 24, 40, 0, 7); g.arc(cx + 38, cy + 34, 36, 0, 7); g.fill(); g.strokeStyle = b; g.lineWidth = 8; g.beginPath(); g.moveTo(cx - 34, cy + 4); g.quadraticCurveTo(cx, cy - 70, cx + 38, cy + 12); g.stroke(); }
    else if (kind === 2) { star(g, cx, cy + 6, 82); g.fill(); }
    else { g.beginPath(); g.arc(cx, cy, 70, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(cx - 22, cy - 24, 22, 0, 7); g.fill(); }
  }
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, W, 90);
  return c;
}

export function drawNight(): HTMLCanvasElement {
  const [c, g] = canvas();
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b1230'); bg.addColorStop(1, '#1b2a5c');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`; g.beginPath(); g.arc(rnd() * W, rnd() * H * 0.8, 0.8 + rnd() * 1.6, 0, 7); g.fill(); }
  g.fillStyle = '#070b1e'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.82 - Math.sin(x * 0.006) * 40 - rnd() * 14); g.lineTo(W, H); g.fill();
  return c;
}

export function drawDaylight(): HTMLCanvasElement {
  const [c, g] = canvas();
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#7cc6ff'); bg.addColorStop(0.7, '#d6efff'); bg.addColorStop(1, '#8fd36a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [x, y, r] of [[300, 220, 70], [380, 200, 90], [470, 225, 64], [1100, 300, 80], [1190, 280, 100], [1290, 305, 70]] as const) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  return c;
}

export function drawBonus(): HTMLCanvasElement {
  const [c, g] = canvas();
  const bg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7); bg.addColorStop(0, '#ffe27a'); bg.addColorStop(0.35, '#ff8a2a'); bg.addColorStop(1, '#5a1670');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H / 2);
  for (let i = 0; i < 16; i++) { g.rotate(Math.PI / 8); g.fillStyle = i % 2 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, -90); g.lineTo(W, 90); g.closePath(); g.fill(); }
  g.restore();
  g.font = '900 220px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 22; g.strokeStyle = '#4a0f5a'; g.strokeText('BONUS', W / 2, H / 2); g.fillStyle = '#fff3a8'; g.fillText('BONUS', W / 2, H / 2);
  for (const [x, y, r] of [[200, 170, 46], [1420, 210, 58], [260, 720, 52], [1360, 700, 44]] as const) { g.fillStyle = '#ffd24a'; g.strokeStyle = '#8a5208'; g.lineWidth = 8; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); }
  return c;
}

export function drawLava(): HTMLCanvasElement {
  const [c, g] = canvas();
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#14060a'); bg.addColorStop(0.6, '#3a0d0a'); bg.addColorStop(1, '#a8300a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let sd = 11;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  g.fillStyle = '#080204';
  for (let k = 0; k < 9; k++) { const x = rnd() * W, w = 90 + rnd() * 140; g.beginPath(); g.moveTo(x - w, 0); g.lineTo(x + w, 0); g.lineTo(x + rnd() * 40, 120 + rnd() * 240); g.closePath(); g.fill(); }
  const pool = g.createRadialGradient(W / 2, H * 0.95, 20, W / 2, H * 0.95, W * 0.5); pool.addColorStop(0, '#fff2a0'); pool.addColorStop(0.35, '#ff9a1a'); pool.addColorStop(1, 'rgba(160,30,0,0)');
  g.fillStyle = pool; g.fillRect(0, H * 0.5, W, H * 0.5);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,${120 + rnd() * 100 | 0},40,${0.3 + rnd() * 0.6})`; g.beginPath(); g.arc(rnd() * W, H * (0.4 + rnd() * 0.6), 1 + rnd() * 3, 0, 7); g.fill(); }
  return c;
}

export async function makeBackdrop(id: BackdropId, barnUrl: string): Promise<HTMLCanvasElement | ImageBitmap | null> {
  switch (id) {
    case 'reels': return drawReels();
    case 'night': return drawNight();
    case 'daylight': return drawDaylight();
    case 'bonus': return drawBonus();
    case 'lava': return drawLava();
    case 'none': return null;
    case 'barn': {
      const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(barnUrl);
      let blob: Blob;
      if (m) { const raw = atob(m[3]!); const u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); blob = new Blob([u.buffer as ArrayBuffer], { type: m[1] || 'image/webp' }); }
      else blob = await (await fetch(barnUrl)).blob();
      return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    }
  }
}
