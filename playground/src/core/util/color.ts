export interface RGBA { r: number; g: number; b: number; a: number }

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(s: unknown): s is string {
  return typeof s === 'string' && HEX.test(s);
}

export function parseColor(s: string): RGBA {
  const m = HEX.exec(s.trim());
  if (!m) return { r: 0, g: 0, b: 0, a: 1 };
  let h = m[1]!;
  if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function toCss({ r, g, b, a }: RGBA): string {
  return a >= 0.9995 ? `rgb(${clamp255(r)},${clamp255(g)},${clamp255(b)})` : `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},${Math.round(a * 1000) / 1000})`;
}

export function toHex({ r, g, b }: RGBA): string {
  return '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  return toCss({ ...c, a: Math.max(0, Math.min(1, c.a * alpha)) });
}

export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a), y = parseColor(b);
  const k = Math.max(0, Math.min(1, t));
  return toCss({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k, a: x.a + (y.a - x.a) * k });
}

export function lighten(color: string, t: number): string { return mix(color, '#ffffff', t); }
export function darken(color: string, t: number): string { return mix(color, '#000000', t); }

/** WCAG relative luminance. */
export function luminance(color: string): number {
  const { r, g, b } = parseColor(color);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
