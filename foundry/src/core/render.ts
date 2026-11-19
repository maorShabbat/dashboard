/** Canvas2D painter: executes a Frame's display list. This is the only DOM-dependent part of rendering. */
import type { Frame, ResolvedLayer } from './engine';
import { cssFontStack } from './fonts';
import type { ClipRect, DrawOp, Paint, Texture } from './ops';

export interface PainterAssets { image(id: string): CanvasImageSource | undefined }
export interface LayerOverride { visible?: boolean; solo?: boolean; opacity?: number }

export interface PaintOptions {
  assets?: PainterAssets;
  /** Extra (user/bundle) font families by id. */
  fontStacks?: Record<string, { family: string; fallback: string }>;
  layerOverrides?: Partial<Record<string, LayerOverride>>;
  /** Device pixel ratio the canvas backing store was sized with. */
  dpr?: number;
}

type Ctx = CanvasRenderingContext2D;

export function roundedRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (rr <= 0.01) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function makePaint(ctx: Ctx, p: Paint, bx: number, by: number, bw: number, bh: number): string | CanvasGradient {
  if (typeof p === 'string') return p;
  if (p.g === 'linear') {
    const a = (p.angle * Math.PI) / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const len = (Math.abs(bw * dx) + Math.abs(bh * dy)) / 2;
    const cx = bx + bw / 2, cy = by + bh / 2;
    const g = ctx.createLinearGradient(cx - dx * len, cy - dy * len, cx + dx * len, cy + dy * len);
    for (const [o, c] of p.stops) g.addColorStop(Math.min(1, Math.max(0, o)), c);
    return g;
  }
  const r = Math.max(1, Math.hypot(bw, bh) / 2);
  const g = ctx.createRadialGradient(bx + bw / 2, by + bh / 2, 0, bx + bw / 2, by + bh / 2, r);
  for (const [o, c] of p.stops) g.addColorStop(Math.min(1, Math.max(0, o)), c);
  return g;
}

function drawTexture(ctx: Ctx, t: Texture, w: number, h: number): void {
  const size = Math.max(t.size, Math.sqrt((w * h) / 3500));
  ctx.save();
  ctx.globalAlpha *= Math.min(1, Math.max(0, t.alpha));
  ctx.fillStyle = t.color; ctx.strokeStyle = t.color;
  if (t.kind === 'halftone') {
    ctx.beginPath();
    for (let y = -h / 2 + size / 2, row = 0; y < h / 2; y += size, row++) {
      for (let x = -w / 2 + size / 2 + (row % 2) * (size / 2); x < w / 2; x += size) { ctx.moveTo(x + size * 0.2, y); ctx.arc(x, y, size * 0.2, 0, Math.PI * 2); }
    }
    ctx.fill();
  } else if (t.kind === 'stripes') {
    ctx.lineWidth = Math.max(1, size * 0.22);
    ctx.beginPath();
    for (let k = -h; k < w; k += size) { ctx.moveTo(-w / 2 + k, h / 2); ctx.lineTo(-w / 2 + k + h, -h / 2); }
    ctx.stroke();
  } else {
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.beginPath();
    for (let x = -w / 2; x <= w / 2; x += size) { ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); }
    for (let y = -h / 2; y <= h / 2; y += size) { ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); }
    ctx.stroke();
  }
  ctx.restore();
}

function applyShadow(ctx: Ctx, op: DrawOp): void {
  if (!op.shadow) return;
  ctx.shadowColor = op.shadow.color; ctx.shadowBlur = op.shadow.blur; ctx.shadowOffsetX = op.shadow.dx; ctx.shadowOffsetY = op.shadow.dy;
}

function applyClip(ctx: Ctx, c: ClipRect): void {
  roundedRectPath(ctx, c.cx - c.w / 2, c.cy - c.h / 2, c.w, c.h, c.r);
  ctx.clip();
}

function drawOp(ctx: Ctx, op: DrawOp, layerAlpha: number, layerBlend: string, opts: PaintOptions): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, (op.alpha ?? 1) * layerAlpha));
  ctx.globalCompositeOperation = (op.blend && op.blend !== 'source-over' ? op.blend : layerBlend) as GlobalCompositeOperation;
  if (op.clip) applyClip(ctx, op.clip);
  switch (op.op) {
    case 'rect': {
      ctx.translate(op.cx, op.cy);
      if (op.rot) ctx.rotate((op.rot * Math.PI) / 180);
      const x = -op.w / 2, y = -op.h / 2;
      roundedRectPath(ctx, x, y, op.w, op.h, op.r ?? 0);
      applyShadow(ctx, op);
      if (op.fill) { ctx.fillStyle = makePaint(ctx, op.fill, x, y, op.w, op.h); ctx.fill(); }
      if (op.texture) {
        ctx.save(); ctx.shadowColor = 'transparent'; roundedRectPath(ctx, x, y, op.w, op.h, op.r ?? 0); ctx.clip(); drawTexture(ctx, op.texture, op.w, op.h); ctx.restore();
      }
      if (op.stroke && (op.lw ?? 0) > 0) {
        if (op.fill) ctx.shadowColor = 'transparent';
        ctx.lineWidth = op.lw!; ctx.strokeStyle = makePaint(ctx, op.stroke, x, y, op.w, op.h);
        if (op.dash) ctx.setLineDash(op.dash);
        roundedRectPath(ctx, x, y, op.w, op.h, op.r ?? 0); ctx.stroke();
      }
      break;
    }
    case 'ellipse': {
      ctx.translate(op.cx, op.cy);
      if (op.rot) ctx.rotate((op.rot * Math.PI) / 180);
      const rx = Math.max(0.01, op.rx), ry = Math.max(0.01, op.ry);
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      applyShadow(ctx, op);
      if (op.fill) { ctx.fillStyle = makePaint(ctx, op.fill, -rx, -ry, rx * 2, ry * 2); ctx.fill(); }
      if (op.stroke && (op.lw ?? 0) > 0) {
        if (op.fill) ctx.shadowColor = 'transparent';
        ctx.lineWidth = op.lw!; ctx.strokeStyle = makePaint(ctx, op.stroke, -rx, -ry, rx * 2, ry * 2); ctx.stroke();
      }
      break;
    }
    case 'poly': {
      const p = op.pts;
      if (p.length < 4) break;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < p.length; i += 2) { minX = Math.min(minX, p[i]!); maxX = Math.max(maxX, p[i]!); minY = Math.min(minY, p[i + 1]!); maxY = Math.max(maxY, p[i + 1]!); }
      ctx.beginPath(); ctx.moveTo(p[0]!, p[1]!);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
      if (op.closed) ctx.closePath();
      applyShadow(ctx, op);
      if (op.fill) { ctx.fillStyle = makePaint(ctx, op.fill, minX, minY, maxX - minX, maxY - minY); ctx.fill(); }
      if (op.stroke && (op.lw ?? 0) > 0) {
        if (op.fill) ctx.shadowColor = 'transparent';
        ctx.lineWidth = op.lw!; ctx.lineJoin = op.join ?? 'round'; ctx.lineCap = op.cap ?? 'round';
        if (op.dash) ctx.setLineDash(op.dash);
        ctx.strokeStyle = makePaint(ctx, op.stroke, minX, minY, maxX - minX, maxY - minY); ctx.stroke();
      }
      break;
    }
    case 'text': {
      ctx.translate(op.x + (op.dx ?? 0), op.y + (op.dy ?? 0));
      if (op.rot) ctx.rotate((op.rot * Math.PI) / 180);
      if (op.scale !== undefined && op.scale !== 1) ctx.scale(op.scale, op.scale);
      ctx.font = `${op.font.weight} ${op.size}px ${cssFontStack(op.font.id, opts.fontStacks)}`;
      ctx.textAlign = op.align ?? 'center'; ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${op.ls ?? 0}px`;
      applyShadow(ctx, op);
      const bx = -op.size * 2, by = -op.size * 0.6;
      if (op.stroke && (op.lw ?? 0) > 0) {
        ctx.lineWidth = op.lw!; ctx.lineJoin = 'round'; ctx.strokeStyle = makePaint(ctx, op.stroke, bx, by, op.size * 4, op.size * 1.2);
        if (op.maxWidth) ctx.strokeText(op.text, 0, 0, op.maxWidth); else ctx.strokeText(op.text, 0, 0);
        ctx.shadowColor = 'transparent';
      }
      if (op.fill) {
        ctx.fillStyle = makePaint(ctx, op.fill, bx, by, op.size * 4, op.size * 1.2);
        if (op.maxWidth) ctx.fillText(op.text, 0, 0, op.maxWidth); else ctx.fillText(op.text, 0, 0);
      }
      break;
    }
    case 'image': {
      const img = opts.assets?.image(op.asset);
      if (!img) break;
      ctx.translate(op.cx, op.cy);
      if (op.rot) ctx.rotate((op.rot * Math.PI) / 180);
      applyShadow(ctx, op);
      ctx.drawImage(img, -op.w / 2, -op.h / 2, op.w, op.h);
      break;
    }
  }
  ctx.restore();
}

export function visibleLayers(layers: ResolvedLayer[], overrides: PaintOptions['layerOverrides']): (ResolvedLayer & { effectiveOpacity: number })[] {
  const anySolo = Object.values(overrides ?? {}).some((o) => o?.solo);
  return layers
    .filter((l) => {
      const o = overrides?.[l.id];
      if (anySolo) return !!o?.solo;
      return l.visible && o?.visible !== false;
    })
    .map((l) => ({ ...l, effectiveOpacity: l.opacity * (overrides?.[l.id]?.opacity ?? 1) }));
}

export function paintFrame(ctx: Ctx, frame: Frame, opts: PaintOptions = {}): void {
  const dpr = opts.dpr ?? 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, frame.viewport.w, frame.viewport.h);
  const byLayer = new Map<string, DrawOp[]>();
  for (const op of frame.ops) { const a = byLayer.get(op.layer); if (a) a.push(op); else byLayer.set(op.layer, [op]); }
  const cam = frame.camera;
  for (const layer of visibleLayers(frame.layers, opts.layerOverrides)) {
    const ops = byLayer.get(layer.id);
    if (!ops?.length) continue;
    ctx.save();
    if (layer.followsCamera && (cam.dx || cam.dy || cam.rot || cam.zoom)) {
      ctx.translate(frame.viewport.w / 2 + cam.dx, frame.viewport.h / 2 + cam.dy);
      ctx.rotate((cam.rot * Math.PI) / 180);
      const z = 1 + cam.zoom; ctx.scale(z, z);
      ctx.translate(-frame.viewport.w / 2, -frame.viewport.h / 2);
    }
    for (const op of ops) drawOp(ctx, op, layer.effectiveOpacity, layer.blend, opts);
    ctx.restore();
  }
}
