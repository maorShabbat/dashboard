/** GLSL for the showcase. All geometry is in scene space (x ∈ [0, aspect], y ∈ [0, 1]); uView maps it to canvas pixels. */

const COMMON = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
`;

const VIEW = /* glsl */ `
uniform vec2 uRes;
uniform vec3 uView; // scale (px per scene unit), offset x, offset y (canvas px, y down)
uniform vec4 uCam;  // camera shake: translation x, y (scene units), rotation (rad), zoom — applied to the picture and to every layer
uniform vec2 uCamC; // the shake pivot (picture centre, scene units)
vec2 camApply(vec2 s) { vec2 d = s - uCamC; float c = cos(uCam.z), n = sin(uCam.z); return uCamC + uCam.w * vec2(c * d.x - n * d.y, n * d.x + c * d.y) + uCam.xy; }
vec2 camInv(vec2 s) { vec2 d = (s - uCam.xy - uCamC) / uCam.w; float c = cos(uCam.z), n = sin(uCam.z); return uCamC + vec2(c * d.x + n * d.y, -n * d.x + c * d.y); }
vec2 toClip(vec2 s) { vec2 px = camApply(s) * uView.x + uView.yz; return vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0); }
`;

export const FULLSCREEN_VS = /* glsl */ `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------------------
// Scene pass: the backdrop and the content layer (text, icons, frames) with true displacement: shockwaves, vortices and screen
// distortions move what is drawn, camera shake moves everything.
export const SCENE_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 oScene;
layout(location = 1) out vec4 oEmit;
in vec2 vUV;
uniform sampler2D uImage;     // backdrop (optional)
uniform sampler2D uContent;   // content layer, premultiplied
uniform sampler2D uContentE;  // light emitted by the content layer (additive)
uniform sampler2D uImageB;    // second screen of a transition
uniform float uHasB;
uniform vec4 uTr;             // transition: kind, progress, seed, mode
uniform vec4 uTrP;            // transition settings (per kind)
uniform vec4 uTrD;            // direction x, y and centre x, y (scene units)
uniform vec4 uTrQ;            // noise scale, shimmer scale, spare, spare
uniform vec3 uTrC1;
uniform vec3 uTrC2;
uniform float uAspect;
uniform vec3 uMatte;
uniform vec2 uGrid;      // mix, lines per scene unit
uniform vec4 uGlobal;    // exposure, edge-pin width, has backdrop, has content
uniform vec4 uFlat;      // flat test background: rgb + mix
const int MAXS = 4;
const int MAXV = 3;
const int MAXD = 4;
uniform int uNS;
uniform vec4 uSA[MAXS];  // cx, cy, front radius, ring half-width
uniform vec4 uSB[MAXS];  // amplitude, pinch radius, pinch strength, ring light
uniform vec4 uSC[MAXS];  // chroma split, life, strain light, unused
uniform vec3 uSCol[MAXS];
uniform int uNV;
uniform vec4 uVA[MAXV];  // cx, cy, radius, pull
uniform vec4 uVB[MAXV];  // twist, glow, absorb, unused
uniform vec3 uVCol[MAXV];
uniform int uND;
uniform vec4 uDA[MAXD]; // kind, strength, phase / time, p0
uniform vec4 uDB[MAXD]; // cx, cy, p1, p2
${COMMON}
${VIEW}

// Asymmetric wave: sharp leading crest, a trailing trough and a faint secondary ripple (not a symmetric sine band).
float waveProfile(float x) {
  float xs = x > 0.0 ? x * 1.55 : x * 0.85;
  float crest = exp(-xs * xs * 1.8);
  float trough = -0.45 * exp(-pow(xs + 1.9, 2.0) * 0.8);
  float ripple = 0.13 * exp(-pow(xs + 3.7, 2.0) * 0.55);
  return crest + trough + ripple;
}

vec2 applyShock(int i, vec2 p, inout vec3 emit, inout float lightMul, inout vec2 chroma) {
  vec4 A = uSA[i]; vec4 B = uSB[i]; vec4 C = uSC[i];
  vec2 d = p - A.xy;
  float r = length(d);
  vec2 dir = d / max(r, 1e-5);
  vec2 shift = vec2(0.0);
  float life = C.y;
  if (A.z > 0.0 && life > 0.0) {
    float W = max(A.w, 1e-4);
    float x = (r - A.z) / W;
    float prof = waveProfile(x);
    float atten = 1.0 / (1.0 + A.z * 1.9);
    float k = B.x * atten * life;
    shift += dir * prof * k;                       // content is carried outward by the crest
    float h = 0.02;
    float dprof = (waveProfile(x + h) - waveProfile(x - h)) / (2.0 * h);
    float strain = k / W * dprof;                  // compression focuses light, rarefaction darkens
    lightMul *= 1.0 - clamp(strain * C.z, -0.35, 0.35);
    chroma += dir * prof * k * C.x;
    float ring = exp(-x * x * 14.0) + 0.3 * exp(-x * x * 2.6);
    emit += uSCol[i] * ring * B.w * life * (0.25 + 0.55 * atten);
  }
  if (B.z != 0.0 && B.y > 0.0) {                   // impact compression: content is pulled toward the point of impact
    float u = r / B.y;
    float f = exp(-u * u * 2.2);
    shift -= d * (B.z * f);
    emit += uSCol[i] * (f * f) * abs(B.z) * 0.04 * B.w;
  }
  return shift;
}

vec2 applyVortex(int i, vec2 p, inout vec3 emit, inout float lightMul) {
  vec4 A = uVA[i]; vec4 B = uVB[i];
  if (A.z <= 0.0 || (A.w == 0.0 && B.x == 0.0)) return vec2(0.0);
  vec2 d = p - A.xy;
  float r = length(d);
  float u = clamp(r / A.z, 0.0, 1.0);
  float f = (1.0 - u) * (1.0 - u);                           // C1 falloff: exactly zero (and flat) at the radius
  float fa = pow(1.0 - smoothstep(0.0, 1.0, u), 1.35);
  float ang = B.x * fa;
  float c = cos(ang), s = sin(ang);
  vec2 ds = vec2(c * d.x - s * d.y, s * d.x + c * d.y) * (1.0 + A.w * f);   // r_s = r (1 + k f): monotonic for k < 3, so no fold-over
  float strength = clamp(abs(A.w) / 2.6 + abs(B.x) / 6.28 * 0.5, 0.0, 1.0);
  float a2 = atan(d.y, d.x) + ang;
  float arm = pow(0.5 + 0.5 * sin(a2 * 5.0 - log(r + 0.03) * 7.0), 3.0);
  emit += uVCol[i] * arm * f * f * strength * B.y;
  lightMul *= 1.0 - B.z * pow(1.0 - u, 3.0) * strength;
  return d - ds;
}

// Screen distortions. Kinds: 1 ripple, 2 lens, 3 heat haze, 4 glitch, 5 wave wobble, 6 zoom blur, 7 chromatic pulse, 8 pixelate, 9 scanlines, 10 shear.
vec2 applyDistort(int i, vec2 p, inout float lightMul, inout vec2 chroma, inout vec3 zoom) {
  vec4 A = uDA[i]; vec4 B = uDB[i];
  int kind = int(A.x + 0.5);
  float k = A.y;
  vec2 c = B.xy;
  vec2 d = p - c;
  float r = length(d);
  vec2 dir = d / max(r, 1e-5);
  if (kind == 1) {                                    // ripple: A.z = how far the rings have travelled, A.w = wavelength, B.z = packet length, B.w = shine
    float behind = A.z - r;
    float env = smoothstep(-A.w * 0.5, A.w * 0.5, behind) * exp(-max(behind, 0.0) / max(B.z, 1e-3)) / (1.0 + r * 2.5);
    float w = sin(6.2831853 * behind / A.w);
    lightMul *= 1.0 + w * env * k * B.w * 6.0;
    return dir * w * env * k;
  }
  if (kind == 2) {                                    // lens: positive bulges (magnifies), negative pinches. B.z = radius
    float u = r / max(B.z, 1e-3);
    float f = exp(-u * u * 2.6);
    chroma += dir * f * abs(k) * 0.05 * u;
    return d * (-k * f);
  }
  if (kind == 3) {                                    // heat haze: A.z = time, A.w = frequency, B.z..B.w = vertical band (y0, y1)
    float band = smoothstep(B.z - 0.25, B.z + 0.05, p.y) * (1.0 - smoothstep(B.w - 0.05, B.w + 0.25, p.y));
    float nx = vnoise(vec2(p.x * A.w * 0.8, p.y * A.w * 1.6 - A.z * 2.2)) - 0.5;
    float ny = vnoise(vec2(p.x * A.w * 1.1 + 7.0, p.y * A.w * 1.3 - A.z * 1.7)) - 0.5;
    return vec2(nx, ny * 0.5) * k * band;
  }
  if (kind == 4) {                                    // glitch: A.z = time step (changes in jumps), A.w = threshold, B.z = number of bands, B.w = chroma split
    float bands = max(B.z, 2.0);
    float bi = floor(p.y * bands);
    float h = hash21(vec2(bi, A.z));
    float h2 = hash21(vec2(bi * 1.7 + 3.0, A.z * 2.3));
    float on = step(A.w, h);
    float big = step(0.92, hash21(vec2(floor(p.y * 5.0), A.z + 9.0)));
    float off = (h2 - 0.5) * k * on * (1.0 + 2.5 * big);
    chroma += vec2(1.0, 0.0) * on * B.w * (0.4 + h2);
    return vec2(off, 0.0);
  }
  if (kind == 5) {                                    // wave wobble: A.z = phase, A.w = frequency, B.z = vertical amount
    return vec2(sin(p.y * A.w + A.z) * k, sin(p.x * A.w * 0.7 + A.z * 1.3) * k * B.z);
  }
  if (kind == 6) {                                    // zoom blur is applied while sampling
    zoom = vec3(c, max(zoom.z, k));
    return vec2(0.0);
  }
  if (kind == 7) {                                    // chromatic pulse: split grows toward the edges
    chroma += d * k;
    return vec2(0.0);
  }
  if (kind == 9) {                                    // scanlines: A.w = frequency, A.z = scroll, B.z = vignette
    float line = 0.5 + 0.5 * sin(p.y * A.w + A.z);
    lightMul *= 1.0 - k * line * 0.6 - B.z * smoothstep(0.35, 0.95, r);
    return vec2(0.0);
  }
  if (kind == 10) {                                   // shear
    return vec2((p.y - c.y) * k, 0.0);
  }
  return vec2(0.0);
}

vec3 gridColor(vec2 q, vec3 base) {
  vec2 g = q * uGrid.y;
  vec2 fw = max(fwidth(g), vec2(1e-5));
  vec2 line = abs(fract(g - 0.5) - 0.5) / fw;
  float l = 1.0 - clamp(min(line.x, line.y) - 0.5, 0.0, 1.0);
  vec2 g4 = g / 4.0;
  vec2 fw4 = max(fwidth(g4), vec2(1e-5));
  vec2 line4 = abs(fract(g4 - 0.5) - 0.5) / fw4;
  float l4 = 1.0 - clamp(min(line4.x, line4.y) - 0.8, 0.0, 1.0);
  vec2 cell = floor(g);
  float checker = mod(cell.x + cell.y, 2.0);
  vec3 bg = mix(vec3(0.05, 0.06, 0.10), vec3(0.09, 0.10, 0.16), checker);
  vec3 col = mix(bg, vec3(0.45, 0.85, 1.0), l);
  col = mix(col, vec3(1.0, 0.85, 0.3), l4);
  return col;
}


// ---- Screen transitions: from screen A (uImage) to screen B (uImageB) ------------------------------------------------------
vec4 screenA(vec2 uv, vec2 gx, vec2 gy) {
  if (uGlobal.z > 0.5) { vec4 t = textureGrad(uImage, uv, gx, gy); return vec4(t.rgb * t.a, 1.0); }
  return vec4(0.03, 0.04, 0.07, 1.0);
}
vec4 screenB(vec2 uv, vec2 gx, vec2 gy) {
  if (uHasB > 0.5) { vec4 t = textureGrad(uImageB, uv, gx, gy); return vec4(t.rgb * t.a, 1.0); }
  return vec4(0.05, 0.07, 0.12, 1.0);
}

// 0 at the point where the front starts, 1 where it ends, for a linear front (direction uTrD.xy) or a radial one (centre uTrD.zw).
float frontField(vec2 q) {
  if (uTr.w > 0.5) {
    vec2 c = uTrD.zw;
    float R = max(max(length(c), length(vec2(uAspect, 0.0) - c)), max(length(vec2(0.0, 1.0) - c), length(vec2(uAspect, 1.0) - c)));
    return length(q - c) / R;
  }
  vec2 dir = normalize(uTrD.xy + 1e-5);
  float ext = abs(dir.x) * uAspect + abs(dir.y);
  return dot(q - vec2(uAspect, 1.0) * 0.5, dir) / ext + 0.5;
}

vec4 transitionBg(vec2 q, vec2 gx, vec2 gy, out vec3 em) {
  em = vec3(0.0);
  int kind = int(uTr.x + 0.5);
  float p = uTr.y, seed = uTr.z;
  vec2 uv = q / vec2(uAspect, 1.0);
  vec4 A, B;
  if (kind == 1) {                                         // FRONT: p = (edge width, char width, noise amount, heat shimmer); a front sweeps over screen A leaving B
    float edgeW = max(uTrP.x, 1e-3), charW = uTrP.y, nAmt = uTrP.z, heat = uTrP.w, ns = uTrQ.x;
    float base = fbm(q * ns + seed);                                   // the slow wander of the front
    float fray = fbm(q * ns * 3.3 + vec2(seed * 1.9, p * 2.0));        // fine fraying that creeps with time
    float f = frontField(q) + (base - 0.5) * nAmt + (fray - 0.5) * nAmt * 0.16;
    float pad = nAmt * 0.5 + edgeW * 2.5 + charW + 0.03;
    float t = mix(-pad, 1.0 + pad, p);
    float d = f - t;                                       // > 0 ahead of the front (still A)
    float ahead = smoothstep(charW * 2.0 + edgeW * 3.0, 0.0, d) * step(0.0, d);
    vec2 uvA = uv + (vec2(vnoise(q * uTrQ.y + vec2(seed, p * 7.0)), vnoise(q * uTrQ.y + vec2(seed + 7.0, p * 6.0))) - 0.5) * heat * ahead;
    A = screenA(uvA, gx, gy); B = screenB(uv, gx, gy);
    // scorched paper: the picture browns and blackens toward the edge in blotches, and burns through in pockets ahead of the front
    float blot = fbm(q * ns * 5.5 + seed * 3.0);
    float scorch = charW > 0.0 ? smoothstep(charW, 0.0, d) * step(0.0, d) : 0.0;      // 0 far from the front, 1 at it
    float brown = clamp(smoothstep(0.0, 0.7, scorch * (0.55 + 0.9 * blot)) * 1.2, 0.0, 1.0);
    vec3 charCol = mix(vec3(0.014, 0.010, 0.008), uTrC1 * 0.20, pow(blot, 2.0) * (1.0 - scorch));
    A.rgb = mix(A.rgb * mix(1.0, 0.4, ahead), charCol, brown);
    float pocket = charW > 0.0 ? smoothstep(0.66, 0.72, blot) * smoothstep(charW * 0.85, charW * 0.12, d) * step(0.0, d) : 0.0;
    float pocketRim = charW > 0.0 ? (smoothstep(0.56, 0.66, blot) - smoothstep(0.66, 0.72, blot)) * smoothstep(charW * 0.9, charW * 0.1, d) * step(0.0, d) : 0.0;
    // light: flickering hot spots in the char, a bright line, a white-hot rim, and an afterglow on the new screen
    float spots = smoothstep(0.42, 0.78, fbm(q * ns * 8.0 + vec2(seed, p * 5.0)));
    float line = exp(-(d / edgeW) * (d / edgeW));
    float rr = (d + edgeW * 0.15) / (edgeW * 0.32);
    float rim = exp(-rr * rr);
    float band = smoothstep(edgeW * 3.0, 0.0, d) * step(0.0, d);
    float aft = exp(d / (edgeW * 4.0)) * step(d, 0.0);
    em = uTrC1 * band * (0.25 + 1.3 * spots) * (0.4 + 0.6 * blot) + mix(uTrC1, uTrC2, line) * line * 0.9 + uTrC2 * rim * 1.3 + uTrC1 * aft * spots * 0.5 + mix(uTrC1, uTrC2, 0.4) * pocketRim * 1.6;
    B.rgb *= 1.0 + 0.35 * line * step(d, 0.0);
    vec4 res = mix(A, B, 1.0 - smoothstep(-0.003, 0.003, d));
    return mix(res, B, pocket);
  }
  if (kind == 2) {                                         // CUT: p = (swap time, softness, flash gain, flash width)
    A = screenA(uv, gx, gy); B = screenB(uv, gx, gy);
    float sw = uTrP.x;
    float w = (p - sw) / max(uTrP.w, 1e-3);
    em = uTrC1 * uTrP.z * exp(-w * w);
    return mix(A, B, smoothstep(sw - uTrP.y, sw + uTrP.y, p));
  }
  if (kind == 3) {                                         // PIXELS / TILES: p = (block size, flip window, sweep order, flip amount)
    float blk = uTrP.x, ws = clamp(uTrP.y, 0.05, 1.0);
    vec2 cell = floor(q / blk), cc = (cell + 0.5) * blk;
    float h = hash21(cell + seed * 13.0);
    float ord = clamp(dot(cc / vec2(uAspect, 1.0) - 0.5, normalize(uTrD.xy + 1e-5)) + 0.5, 0.0, 1.0);
    float ti = mix(h, ord, uTrP.z) * (1.0 - ws);
    float local = clamp((p - ti) / ws, 0.0, 1.0);
    float sc = mix(1.0, abs(cos(local * 3.14159265)), uTrP.w);
    vec2 inC = (q - cc) / blk;
    float inside = step(max(abs(inC.x), abs(inC.y)), 0.5 * sc + 1e-4);
    vec4 src = local < 0.5 ? screenA(uv, gx, gy) : screenB(uv, gx, gy);
    em = uTrC1 * sin(local * 3.14159265) * 0.8 * inside;
    return mix(vec4(0.01, 0.01, 0.02, 1.0), src, inside);
  }
  if (kind == 4) {                                         // GLITCH: p = (number of rows, shift amount, colour split, block noise)
    float rows = uTrP.x, row = floor(q.y * rows);
    float ts = hash21(vec2(row, seed)) * 0.6 + 0.2;
    float jit = step(0.5, hash21(vec2(row, floor(p * 24.0) + seed))) * step(abs(p - ts), 0.07);
    bool showB = (p > ts) != (jit > 0.5);
    float act = sin(3.14159265 * clamp(p, 0.0, 1.0));
    float off = (hash21(vec2(row * 1.7, floor(p * 14.0) + seed)) - 0.5) * uTrP.y * act * step(0.35, hash21(vec2(row, floor(p * 14.0) + 3.0)));
    float sp = uTrP.z * act * (0.3 + hash21(vec2(row, 5.0)));
    vec4 r1, g1, b1;
    if (showB) { r1 = screenB(uv + vec2(off + sp, 0.0), gx, gy); g1 = screenB(uv + vec2(off, 0.0), gx, gy); b1 = screenB(uv + vec2(off - sp, 0.0), gx, gy); }
    else { r1 = screenA(uv + vec2(off + sp, 0.0), gx, gy); g1 = screenA(uv + vec2(off, 0.0), gx, gy); b1 = screenA(uv + vec2(off - sp, 0.0), gx, gy); }
    vec4 o = vec4(r1.r, g1.g, b1.b, 1.0);
    vec2 bc = floor(q * vec2(9.0, 14.0));
    float blockOn = step(1.0 - uTrP.w * act, hash21(bc + floor(p * 18.0) + seed));
    o.rgb = mix(o.rgb, vec3(1.0) - o.rgb, blockOn * 0.6);
    em = mix(uTrC1, uTrC2, step(0.5, hash21(vec2(row, 9.0)))) * jit * 0.6 * act;
    return o;
  }
  if (kind == 5) {                                         // COVER: p = (softness, noise amount, peak, swap); a cloud / ink covers the screen, B appears under it, the cover lifts
    float soft = max(uTrP.x, 1e-3), nAmt = uTrP.y, sw = uTrP.w;
    float f = frontField(q) + (fbm(q * uTrQ.x + seed) - 0.5) * nAmt;
    float bell = p < sw ? sin(1.5707963 * p / sw) : cos(1.5707963 * (p - sw) / (1.0 - sw));
    float thr = bell * uTrP.z * (1.0 + nAmt * 0.6 + soft * 2.0);
    float cov = 1.0 - smoothstep(thr - soft, thr + soft, f);
    A = p < sw ? screenA(uv, gx, gy) : screenB(uv, gx, gy);
    float shade = fbm(q * uTrQ.x * 1.7 + seed * 3.0 + p * 0.7);
    vec3 cc = mix(uTrC1, uTrC2, shade * shade * 1.6);
    em = uTrC2 * 0.08 * cov * (1.0 - cov) * 4.0;
    return vec4(mix(A.rgb, cc, cov * uTrP.z / max(uTrP.z, 1e-3)), 1.0);
  }
  if (kind == 6) {                                         // ZOOM: p = (zoom amount, blur, swap centre, swap width)
    vec2 c = uTrD.zw;
    float k = uTrP.x, bl = uTrP.y;
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int j = 0; j < 8; j++) {
      float u = float(j) / 7.0 - 0.5;
      float pa = clamp(p + u * bl, 0.0, 1.0);
      a += screenA(c / vec2(uAspect, 1.0) + (uv - c / vec2(uAspect, 1.0)) / (1.0 + k * pa * pa), gx, gy);
      b += screenB(c / vec2(uAspect, 1.0) + (uv - c / vec2(uAspect, 1.0)) * (1.0 + k * (1.0 - clamp(p + u * bl, 0.0, 1.0)) * 0.6), gx, gy);
    }
    a /= 8.0; b /= 8.0;
    float w = (p - uTrP.z) / max(uTrP.w, 1e-3);
    em = uTrC1 * exp(-w * w) * 0.35 * exp(-length(q - c) * 2.2);
    return mix(a, b, smoothstep(uTrP.z - uTrP.w, uTrP.z + uTrP.w, p));
  }
  if (kind == 7) {                                         // FLIP: p = (count, axis 0 slats 1 strips 2 tiles, stagger window, sweep order); slats turn over to show B
    float N = uTrP.x, axis = uTrP.y, ws = clamp(uTrP.z, 0.05, 1.0);
    vec2 cc, hf; float id, ordv;
    if (axis < 0.5) { float bh = 1.0 / N; float r = floor(q.y / bh); cc = vec2(uAspect * 0.5, (r + 0.5) * bh); hf = vec2(uAspect * 0.5, bh * 0.5); id = r; ordv = r / N; }
    else if (axis < 1.5) { float bw = uAspect / N; float c0 = floor(q.x / bw); cc = vec2((c0 + 0.5) * bw, 0.5); hf = vec2(bw * 0.5, 0.5); id = c0; ordv = c0 / N; }
    else { float bw = uAspect / N; vec2 cl = floor(q / bw); cc = (cl + 0.5) * bw; hf = vec2(bw * 0.5); id = hash21(cl + seed); ordv = clamp(dot(cc / vec2(uAspect, 1.0) - 0.5, normalize(uTrD.xy + 1e-5)) + 0.5, 0.0, 1.0); }
    float ti = mix(hash11(id * 7.31 + seed), ordv, uTrP.w) * (1.0 - ws);
    float local = clamp((p - ti) / ws, 0.0, 1.0);
    float th = local * 3.14159265, sc = max(abs(cos(th)), 0.02);
    vec2 rel = q - cc;
    vec2 rl = axis < 0.5 ? vec2(rel.x, rel.y / sc) : vec2(rel.x / sc, rel.y);
    bool inFace = abs(rl.x) <= hf.x && abs(rl.y) <= hf.y;
    vec4 src = local < 0.5 ? screenA((cc + rl) / vec2(uAspect, 1.0), gx, gy) : screenB((cc + rl) / vec2(uAspect, 1.0), gx, gy);
    src.rgb *= mix(0.3, 1.0, sc);
    em = uTrC1 * pow(1.0 - sc, 4.0) * 0.5 * (inFace ? 1.0 : 0.0);
    return inFace ? src : vec4((local < 0.5 ? screenA(uv, gx, gy) : screenB(uv, gx, gy)).rgb * 0.2, 1.0);
  }
  if (kind == 8) {                                         // BANDS (laser scan): p = (bands, stagger, beam width, gap darkness); beams sweep across each band, B behind them
    float N = uTrP.x, row = floor(q.y * N), st = uTrP.y;
    float t0 = hash21(vec2(row, seed)) * st;
    float local = clamp((p - t0) / max(1.0 - st, 0.05), 0.0, 1.0);
    float hx = local * (uAspect + 0.12) - 0.06;
    float dir = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
    if (dir < 0.0) hx = uAspect - hx;
    bool behind = dir > 0.0 ? q.x < hx : q.x > hx;
    A = screenA(uv, gx, gy); B = screenB(uv, gx, gy);
    float dist = abs(q.x - hx);
    float act = smoothstep(0.0, 0.03, local) * (1.0 - smoothstep(0.97, 1.0, local));
    float bw = uTrP.z;
    float core = exp(-dist * dist / (bw * bw * 0.05));
    float yin = fract(q.y * N);
    float band = smoothstep(0.0, 0.08, yin) * (1.0 - smoothstep(0.92, 1.0, yin));
    float afterglow = behind ? exp(-dist / 0.22) * act : 0.0;
    float scan = 0.86 + 0.14 * sin(q.y * 900.0 + p * 40.0);                      // scanlines on the freshly revealed picture
    vec3 Bc = B.rgb * mix(1.0, scan, afterglow) + uTrC1 * 0.26 * afterglow * band;
    vec3 Ac = A.rgb * (1.0 + 0.35 * exp(-dist / (bw * 2.5)) * act);
    float halo = behind ? exp(-dist / (bw * 3.0)) * 0.4 : 0.18 * exp(-dist / (bw * 2.0));
    em = mix(uTrC1, uTrC2, clamp(core, 0.0, 1.0)) * (core * 1.7 + halo) * act * (0.3 + 0.7 * band);
    vec4 o = behind ? vec4(Bc, 1.0) : vec4(Ac, 1.0);
    o.rgb *= 1.0 - uTrP.w * (1.0 - band) * act;
    return o;
  }
  if (kind == 10) {                                        // FROST: p = (edge softness, frost whiteness, crystal scale, tint strength); frost grows in from the screen edges over A
    float ed = min(min(q.x, uAspect - q.x), min(q.y, 1.0 - q.y)) / 0.5;
    float nz = fbm(q * uTrQ.x + seed) - 0.5;
    float thr = p * 1.25;
    float field = ed + nz * 0.35;
    float cov = 1.0 - smoothstep(thr - uTrP.x, thr, field);          // how frozen this point is
    vec2 w = q * uTrP.z;
    vec2 warp = vec2(fbm(w * 0.6 + seed), fbm(w * 0.6 + 4.1 + seed)) - 0.5;
    float ridge = 1.0 - abs(fbm(w + warp * 2.2) * 2.0 - 1.0);       // thin bright veins: ferns of ice
    float grain = vnoise(q * uTrP.z * 9.0 + seed * 3.0);
    float vein = smoothstep(0.66, 0.96, ridge);
    float milk = clamp(cov * (0.35 + 0.75 * ridge), 0.0, 1.0);
    // frosted glass: the picture behind is bent and blurred by the ice
    vec2 off = warp * 0.045 * cov;
    vec4 A0 = screenA(uv + off, gx, gy);
    vec3 acc = A0.rgb;
    for (int j = 0; j < 6; j++) { float a = float(j) * 1.0472 + seed; acc += screenA(uv + off + vec2(cos(a), sin(a)) * 0.007 * cov, gx, gy).rgb; }
    vec3 base = mix(screenA(uv, gx, gy).rgb, acc / 7.0, clamp(cov * 1.1, 0.0, 1.0));
    vec3 icy = base * vec3(0.62, 0.84, 1.1) + vec3(0.03, 0.06, 0.1);
    vec3 col = mix(base, icy, cov * uTrP.w);
    col = mix(col, vec3(0.82, 0.93, 1.0), milk * uTrP.y * 0.62 * smoothstep(0.25, 0.9, cov));
    col += vec3(0.9, 0.97, 1.0) * vein * cov * (0.45 + 0.55 * grain) * uTrP.y;
    float glint = smoothstep(0.985, 1.0, grain) * cov;
    col += vec3(1.0) * glint * 0.6;
    float front = exp(-pow((field - thr) / 0.06, 2.0)) * (0.4 + 0.9 * ridge);
    em = uTrC1 * front * 0.55 * step(0.001, p) + vec3(0.7, 0.9, 1.0) * glint * 0.5 + uTrC1 * vein * cov * 0.12;
    return vec4(col, 1.0);
  }
  return screenA(uv, gx, gy);
}

// Backdrop + content at a (displaced) scene position. Premultiplied result; the content's emitted light comes back in em.
vec4 fetchScene(vec2 q, vec2 gx, vec2 gy, out vec3 em) {
  vec2 uv = q / vec2(uAspect, 1.0);
  vec4 bg = vec4(0.0);
  vec3 trEm = vec3(0.0);
  if (uTr.x > 0.5) bg = transitionBg(q, gx, gy, trEm);
  else if (uGlobal.z > 0.5) { vec4 t = textureGrad(uImage, uv, gx, gy); bg = vec4(t.rgb * t.a, t.a); }
  if (uGrid.x > 0.0) bg.rgb = mix(bg.rgb, gridColor(q, bg.rgb), uGrid.x);
  if (uFlat.a > 0.0) bg = mix(bg, vec4(uFlat.rgb, 1.0), uFlat.a);
  vec4 ct = vec4(0.0);
  em = trEm;
  if (uGlobal.w > 0.5) {
    vec2 cpx = q * uView.x + uView.yz;
    vec2 cuv = vec2(cpx.x / uRes.x, 1.0 - cpx.y / uRes.y);
    ct = texture(uContent, cuv);
    em += texture(uContentE, cuv).rgb;
  }
  return ct + bg * (1.0 - ct.a);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 pS = (px - uView.yz) / uView.x;                       // position on screen (scene units)
  vec2 p = camInv(pS);                                       // position in the shaken world: everything below is evaluated here
  vec2 uv0 = p / vec2(uAspect, 1.0);
  vec2 gx = dFdx(uv0), gy = dFdy(uv0);
  bool inside = pS.x >= 0.0 && pS.x <= uAspect && pS.y >= 0.0 && pS.y <= 1.0;
  if (!inside) { oScene = vec4(uMatte, 1.0); oEmit = vec4(0.0); return; }

  vec2 shift = vec2(0.0);
  vec3 emit = vec3(0.0);
  float lightMul = 1.0;
  vec2 chroma = vec2(0.0);
  vec3 zoom = vec3(0.5 * uAspect, 0.5, 0.0);
  for (int i = 0; i < MAXS; i++) { if (i >= uNS) break; shift += applyShock(i, p, emit, lightMul, chroma); }
  for (int i = 0; i < MAXV; i++) { if (i >= uNV) break; shift += applyVortex(i, p, emit, lightMul); }
  for (int i = 0; i < MAXD; i++) { if (i >= uND) break; shift += applyDistort(i, p, lightMul, chroma, zoom); }

  // Pin the picture border: displacement fades to zero at the edge, so no outside area can ever be revealed.
  float edge = min(min(p.x, uAspect - p.x), min(p.y, 1.0 - p.y));
  float pin = smoothstep(0.0, uGlobal.y, edge);
  vec2 q = p - shift * pin;
  for (int i = 0; i < MAXD; i++) {                           // pixelate snaps the sample position to a grid
    if (i >= uND) break;
    if (int(uDA[i].x + 0.5) == 8) { float cell = max(uDA[i].w, 1e-3); q = mix(q, (floor(q / cell) + 0.5) * cell, clamp(uDA[i].y, 0.0, 1.0)); }
  }
  vec2 cq = chroma * pin;

  vec3 em = vec3(0.0);
  vec4 sc;
  if (zoom.z > 0.0) {                                        // zoom blur: average along the ray toward the centre
    vec4 acc = vec4(0.0); vec3 eacc = vec3(0.0);
    for (int k = 0; k < 10; k++) {
      float f = float(k) / 9.0;
      vec2 qk = zoom.xy + (q - zoom.xy) * (1.0 - zoom.z * f);
      vec3 e; vec4 t = fetchScene(qk, gx, gy, e);
      acc += t; eacc += e;
    }
    sc = acc / 10.0; em = eacc / 10.0;
  } else if (dot(cq, cq) > 1e-10) {
    vec3 e1, e2, e3;
    vec4 a1 = fetchScene(q + cq, gx, gy, e1);
    vec4 a2 = fetchScene(q, gx, gy, e2);
    vec4 a3 = fetchScene(q - cq, gx, gy, e3);
    sc = vec4(a1.r, a2.g, a3.b, max(a1.a, max(a2.a, a3.a)));
    em = vec3(e1.r, e2.g, e3.b);
  } else {
    sc = fetchScene(q, gx, gy, em);
  }
  sc.rgb *= lightMul * uGlobal.x;
  oScene = sc;
  oEmit = vec4(emit + em, 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------------------
// Sprites (instanced quads): glows, rings, glints, hot cores, streaks (additive) and dust discs (alpha).
export const SPRITE_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aA;   // cx, cy, hw, hh
layout(location = 2) in vec4 aB;   // rot, type, e1, e2
layout(location = 3) in vec4 aC;   // r, g, b, intensity
out vec2 vC;
flat out vec4 vB;
flat out vec4 vCol;
${VIEW}
void main() {
  float c = cos(aB.x), s = sin(aB.x);
  vec2 l = aCorner * aA.zw;
  vec2 w = aA.xy + vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  vC = aCorner; vB = aB; vCol = aC;
  gl_Position = vec4(toClip(w), 0.0, 1.0);
}`;

export const SPRITE_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 oScene;
layout(location = 1) out vec4 oEmit;
in vec2 vC;
flat in vec4 vB;
flat in vec4 vCol;
uniform float uAlphaPass;
${COMMON}
void main() {
  int type = int(vB.y + 0.5);
  vec3 col = vCol.rgb;
  float I = vCol.a;
  vec2 c = vC;
  float r2 = dot(c, c);
  vec3 outc = vec3(0.0);
  if (type == 0) {                                   // soft glow with a tight bright centre
    float g = exp(-r2 * (3.2 + vB.z)) * 0.65 + exp(-r2 * 16.0) * 0.5;
    outc = col * g * I;
  } else if (type == 1) {                            // ring: e1 = thickness (fraction of radius)
    float t = max(vB.z, 0.02);
    float rr = sqrt(r2);
    float k = (rr - (1.0 - t * 1.6)) / t;
    outc = col * exp(-k * k * 2.2) * I * (1.0 - smoothstep(0.92, 1.0, rr));
  } else if (type == 2) {                            // four-point glint
    float s1 = exp(-abs(c.x) * 26.0 - abs(c.y) * 2.4);
    float s2 = exp(-abs(c.y) * 26.0 - abs(c.x) * 2.4);
    float core = exp(-r2 * 140.0);                   // the centre stays compact however long the arms are
    outc = mix(col, vec3(1.0), 0.6) * (s1 + s2 + core * 1.2) * I;
  } else if (type == 3) {                            // hot core: white centre, coloured halo
    float core = exp(-r2 * 10.0);
    float halo = exp(-r2 * 2.6);
    outc = mix(col, vec3(1.0), core) * (core * 1.7 + halo * 0.55) * I;
  } else if (type == 4) {                            // streak: head at +x, long fading tail
    float u = c.x * 0.5 + 0.5;
    float body = pow(clamp(u, 0.0, 1.0), max(vB.z, 0.5)) * exp(-c.y * c.y * 7.0);
    float head = exp(-pow((c.x - 0.88) * 4.5, 2.0) - c.y * c.y * 9.0);
    outc = mix(col, vec3(1.0), head * 0.8) * (body * 0.9 + head * 1.4) * I;
  }
  else if (type == 6) {                              // ray: a one-sided beam, bright at the origin (x = -1), fading toward the tip (x = +1); e1 = narrowness
    float u = c.x * 0.5 + 0.5;
    float across = exp(-c.y * c.y * (5.0 + vB.z * 9.0));
    float along = pow(max(1.0 - u, 0.0), 1.15) * smoothstep(0.0, 0.05, u);
    outc = col * across * along * I;
  }
  if (uAlphaPass > 0.5) {                            // dust disc: ragged soft edge, premultiplied alpha
    float rr = sqrt(r2) + (vnoise(c * 3.0 + vB.w * 11.0) - 0.5) * 0.45;
    float a = (1.0 - smoothstep(0.35, 0.95, rr)) * I;
    oScene = vec4(col * a, a);
  } else {
    oEmit = vec4(outc, 1.0);
  }
}`;

// ---------------------------------------------------------------------------------------------------------------------
// Illustrated smoke: cel-shaded cloud puffs from a signed-distance union of lobes.
export const SMOKE_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aA;   // cx, cy, size, rot
layout(location = 2) in vec4 aB;   // age, seed, alpha, erode
layout(location = 3) in vec4 aC;   // tone, warmth, light.x, light.y (world)
out vec2 vP;
flat out vec4 vB;
flat out vec4 vC;
flat out vec2 vRot;
${VIEW}
void main() {
  float c = cos(aA.w), s = sin(aA.w);
  vec2 l = aCorner * 0.92;
  vec2 w = aA.xy + aA.z * vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  vP = l; vB = aB; vC = aC; vRot = vec2(c, s);
  gl_Position = vec4(toClip(w), 0.0, 1.0);
}`;

export const SMOKE_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 oScene;
in vec2 vP;
flat in vec4 vB;
flat in vec4 vC;
flat in vec2 vRot;
uniform vec3 uPal[4];   // shadow, mid, light, rim
${COMMON}

vec3 gL[7];   // lobe centre.xy, radius — derived from the seed once per fragment

void lobes(float seed) {
  // one big centre lobe + six ring lobes: reads as a billowing puff with scalloped edges, never a pebble
  float h0 = hash11(seed * 1.77 + 0.3);
  gL[0] = vec3((hash11(seed * 3.1) - 0.5) * 0.06, (hash11(seed * 4.3) - 0.5) * 0.06, 0.29 + 0.05 * h0);
  for (int i = 1; i < 7; i++) {
    float fi = float(i);
    float h1 = hash11(seed * 1.31 + fi * 7.13);
    float h2 = hash11(seed * 2.17 + fi * 3.71 + 1.7);
    float h3 = hash11(seed * 0.73 + fi * 5.31 + 4.1);
    float ang = (fi - 1.0) * 1.0471976 + (h1 - 0.5) * 0.55 + seed;
    float rad = 0.2 + 0.07 * h2;
    float r = 0.17 + 0.075 * h3;
    gL[i] = vec3(cos(ang) * rad, sin(ang) * rad, r);
  }
}

float cloud(vec2 p) {
  float d = 1e3;
  for (int i = 0; i < 7; i++) {
    float di = length(p - gL[i].xy) - gL[i].z;
    float k = 0.035;
    float hh = clamp(0.5 + 0.5 * (d - di) / k, 0.0, 1.0);   // small smooth-min keeps scalloped cusps
    d = mix(d, di, hh) - k * hh * (1.0 - hh);
  }
  return d;
}

void main() {
  float age = vB.x, seed = vB.y, er = vB.w;
  vec2 p = vP;
  lobes(seed);
  float nz = fbm(p * 2.4 + seed * 5.0);
  float erode = er * 0.36 + er * (nz - 0.5) * 0.55;
  float d = cloud(p) + erode;
  float aa = fwidth(d) * 0.9 + 1e-4 + er * 0.045;     // breakup also softens the edge, so decay reads as dissolving, not shattering
  float a = 1.0 - smoothstep(-aa, aa, d);
  if (a <= 0.003) discard;
  vec2 Lw = normalize(vC.zw);
  vec2 Ll = vec2(vRot.x * Lw.x + vRot.y * Lw.y, -vRot.y * Lw.x + vRot.x * Lw.y);
  float dl1 = cloud(p + Ll * 0.07) + erode;      // thin light sliver (shape shifted away from the light)
  float dl2 = cloud(p + Ll * 0.16) + erode;      // wider lit band
  float ds1 = cloud(p - Ll * 0.15) + erode;      // shadow band (shape shifted toward the light)
  float ds2 = cloud(p - Ll * 0.26) + erode;      // deep shadow core
  vec3 mid = mix(uPal[1], uPal[2], vC.x * 0.35);
  vec3 col = mid;
  float inside = step(d, 0.0);
  if (dl2 > 0.0 && inside > 0.5) col = mix(uPal[1], uPal[2], 0.85);
  if (dl1 > 0.0 && inside > 0.5) col = mix(uPal[2], uPal[3], vC.y);
  if (ds1 > 0.0 && inside > 0.5) col = mix(uPal[1], uPal[0], 0.7);
  if (ds2 > 0.0 && inside > 0.5) col = mix(uPal[0], uPal[1], 0.28);
  float pocket = smoothstep(0.52, 0.60, fbm(p * 3.6 + seed * 2.0 + 4.0)) * smoothstep(-0.02, -0.18, d);
  col = mix(col, uPal[0], pocket * 0.22);
  float wisp = smoothstep(0.62, 0.70, fbm(p * 5.2 + seed * 1.3 + 9.0)) * smoothstep(-0.05, -0.2, d);
  col = mix(col, uPal[2], wisp * 0.35 * (1.0 - age));
  float stroke = smoothstep(-0.05, -0.014, d);
  col = mix(col, uPal[0] * 0.5, stroke * (0.8 - 0.6 * er));
  float fade = 1.0 - smoothstep(0.84, 1.0, age);
  float alpha = a * vB.z * fade;
  oScene = vec4(col * alpha, alpha);
}`;

// ---------------------------------------------------------------------------------------------------------------------
// Volumetric fire and smoke: every puff is a domain-warped noise field. Smoke is lit by looking through the cloud toward the light
// (thick parts shade themselves), flames are a rising, tapering temperature field read through a black-body style ramp, and a
// fireball is a hot core inside a turbulent shell that cools to soot. Two passes: the body (premultiplied alpha) and the glow.
export const VOL_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aA;   // cx, cy, size, rot
layout(location = 2) in vec4 aB;   // age, seed, kind, alpha
layout(location = 3) in vec4 aC;   // heat, stretch, light.x, light.y
layout(location = 4) in vec4 aD;   // time since birth
out vec2 vP;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
flat out vec2 vRot;
${VIEW}
void main() {
  float c = cos(aA.w), s = sin(aA.w);
  vec2 l = vec2(aCorner.x, aCorner.y * aC.y);
  vec2 w = aA.xy + aA.z * vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  vP = aCorner; vB = aB; vC = aC; vD = aD; vRot = vec2(c, s);
  gl_Position = vec4(toClip(w), 0.0, 1.0);
}`;

export const VOL_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 oScene;
layout(location = 1) out vec4 oEmit;
in vec2 vP;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
flat in vec2 vRot;
uniform float uPass;        // 0: body (premultiplied alpha), 1: glow (additive)
uniform vec3 uFire[4];      // deep, hot, bright, white-hot
uniform vec3 uShadow;
uniform vec3 uLit;
uniform vec3 uWarm;
${COMMON}

float fbm5(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = m * p + vec2(11.7, 5.3); a *= 0.5; }
  return s;
}

vec3 fireRamp(float T) {
  vec3 c = mix(vec3(0.0), uFire[0], smoothstep(0.0, 0.22, T));
  c = mix(c, uFire[1], smoothstep(0.2, 0.5, T));
  c = mix(c, uFire[2], smoothstep(0.45, 0.78, T));
  c = mix(c, uFire[3], smoothstep(0.75, 1.0, T));
  return c;
}

float smokeDensity(vec2 p, vec2 w, float seed, float tt, float age, float soft) {
  vec2 q = p * 1.35 + vec2(seed * 3.7, seed * 1.9);
  float n = fbm5(q * 1.5 + (w - 0.5) * 2.4 + vec2(0.0, -tt * 0.45));
  float body = 1.0 - smoothstep(0.0, 1.0, length(p) * 1.04);
  return body * mix(1.5, 1.25, soft) + (n - 0.48) * mix(1.55, 0.75, soft) - age * age * 0.85;
}

void main() {
  float age = vB.x, seed = vB.y, alpha = vB.w, heat = vC.x, tt = vD.x;
  int kind = int(vB.z + 0.5);
  vec2 p = vP;
  vec3 col = vec3(0.0);
  float a = 0.0;
  vec3 glow = vec3(0.0);

  if (kind == 0) {                                                  // smoke
    float r = length(p);
    vec2 q = p * 1.35 + vec2(seed * 3.7, seed * 1.9);
    vec2 w = vec2(fbm5(q * 0.8 + vec2(0.0, -tt * 0.30)), fbm5(q * 0.8 + vec2(8.3, 2.1 - tt * 0.24)));
    float soft = clamp(vD.y, 0.0, 1.0);                            // soft, wispy puffs (steam, mist)
    float d = smokeDensity(p, w, seed, tt, age, soft);
    a = smoothstep(0.02, mix(0.5, 1.1, soft), d) * alpha * (1.0 - smoothstep(0.8, 1.0, r));
    if (a <= 0.002) discard;
    vec2 Lw = normalize(vC.zw + 1e-4);
    vec2 L = vec2(vRot.x * Lw.x + vRot.y * Lw.y, -vRot.y * Lw.x + vRot.x * Lw.y);
    float d2 = smokeDensity(p + L * 0.22, w, seed, tt, age, soft);      // thickness between this point and the light
    float lit = exp(-max(d2, 0.0) * 1.9);
    float n = fbm5(q * 2.2 + tt * 0.1);
    col = mix(uShadow, uLit, clamp(mix(lit * 0.88 + 0.12 * n, 0.55 + 0.4 * lit, soft), 0.0, 1.0));
    float warm = clamp(heat * exp(-r * r * 2.0) * (1.0 - age), 0.0, 1.0);
    col = mix(col, uWarm, warm * 0.7) + uWarm * warm * 0.25;
    glow = uWarm * warm * a * 0.7;
  } else if (kind == 1) {                                           // flame tongue
    float hb = (1.0 - p.y) * 0.5;                                   // 0 at the base, 1 at the tip
    vec2 nc = vec2(p.x * 1.6, hb * vC.y * 1.5) + seed * 7.1;
    float flick = fbm5(nc * 1.3 + vec2(3.1, -tt * 2.6));
    float sway = (flick - 0.5) * (0.25 + hb * 0.9);
    float wEnv = mix(0.8, 0.10, pow(hb, 0.8));
    float xx = abs(p.x + sway) / max(wEnv, 0.02);
    float core = 1.0 - smoothstep(0.0, 1.0, xx);
    float n = fbm5(nc * 1.1 + vec2(0.0, -tt * 1.3) + (flick - 0.5) * 1.2);
    float T = core * (1.12 - hb * 0.95) * (0.55 + 0.9 * n);
    T *= 1.0 - smoothstep(0.55, 1.0, hb + (n - 0.5) * 0.5);
    T = clamp(T * heat * (1.0 - age * age), 0.0, 1.0);
    a = smoothstep(0.03, 0.2, T) * alpha;
    if (a <= 0.002) discard;
    col = fireRamp(T * 0.92);
    glow = fireRamp(T) * T * 1.15 * alpha;
  } else if (kind == 3) {                                           // soft flame: rooted, turbulent, hot core, translucent edges, wisps at the tip
    float hb = (1.0 - p.y) * 0.5;                                   // 0 at the base, 1 at the tip
    float xw = p.x / (0.66 * pow(max(1.0 - hb, 0.0), 0.62) + 0.03);  // -1..1 across the flame's width at this height
    vec2 nc = vec2(p.x * 2.3, hb * vC.y * 1.05) + seed * 7.1;
    vec2 wv = vec2(fbm5(nc + vec2(0.0, -tt * 1.8)), fbm5(nc + vec2(5.2, 1.3 - tt * 1.8))) - 0.5;      // domain warp: the tongue licks and curls
    float n = fbm5(nc * 1.7 + wv * 1.7 + vec2(0.0, -tt * 3.0));
    float lean = (fbm5(vec2(hb * 1.5 + seed, -tt * 1.1 + seed * 2.0)) - 0.5) * 0.9 * pow(hb, 1.3);   // the whole tongue sways more toward its tip
    float xs = (p.x - lean) / (0.66 * pow(max(1.0 - hb, 0.0), 0.62) + 0.03);
    float shape = (1.0 - xs * xs) * (1.0 - pow(hb, 1.15));          // fat at the base, tapering to nothing
    float d = shape + (n - 0.5) * (0.6 + 0.8 * hb) - 0.1 * hb;      // noise eats the edges, more toward the tip
    d *= smoothstep(0.0, 0.1, hb);                                   // rooted: fades in over the burning edge
    d *= 1.0 - age * age;
    a = smoothstep(0.0, 0.42, d) * 0.96 * alpha;
    if (a <= 0.002) discard;
    float T = clamp(smoothstep(0.04, 1.05, d) * heat + 0.08 * (n - 0.5), 0.0, 1.0);
    col = fireRamp(T);
    glow = fireRamp(T) * T * 0.85 * alpha;
  } else {                                                          // fireball
    vec2 nc = p * 1.7 + seed * 5.3 + vec2(0.0, -tt * 0.55);
    vec2 w = vec2(fbm5(nc), fbm5(nc + 4.7)) - 0.5;
    float n = fbm5(nc * 1.35 + w * 2.1 - vec2(0.0, tt * 0.3));
    float s = length(p) + (n - 0.5) * 0.75;
    float shape = 1.0 - smoothstep(0.30, 0.98, s);
    float core = 1.0 - smoothstep(0.0, 0.62, s);
    float T = clamp((shape * 0.5 + core * 0.85) * heat, 0.0, 1.0) * (1.0 - age * age * 0.85);
    a = smoothstep(0.02, 0.3, shape) * alpha;
    if (a <= 0.002) discard;
    col = mix(vec3(0.07, 0.05, 0.045), fireRamp(T), smoothstep(0.08, 0.5, T));
    glow = fireRamp(T) * (T * 1.5 + core * (1.0 - age) * 0.5) * alpha;
  }
  if (uPass < 0.5) oScene = vec4(col * a, a);
  else oEmit = vec4(glow, 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------------------
// Flat polygons (comic burst silhouettes, shadows) and soft ribbons (smoke wisps).
export const POLY_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aCol;
flat out vec4 vCol;
${VIEW}
void main() { vCol = aCol; gl_Position = vec4(toClip(aPos), 0.0, 1.0); }`;

export const POLY_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 oScene;
flat in vec4 vCol;
void main() { oScene = vec4(vCol.rgb * vCol.a, vCol.a); }`;

export const RIBBON_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aSV;
layout(location = 2) in vec4 aCol;
out vec2 vSV;
out vec4 vCol;
${VIEW}
void main() { vSV = aSV; vCol = aCol; gl_Position = vec4(toClip(aPos), 0.0, 1.0); }`;

export const RIBBON_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 oScene;
in vec2 vSV;
in vec4 vCol;
void main() {
  float body = smoothstep(1.0, 0.45, abs(vSV.x));
  float ends = pow(sin(clamp(vSV.y, 0.0, 1.0) * 3.14159), 0.55);
  float a = body * ends * vCol.a;
  float lit = smoothstep(0.1, -0.8, vSV.x);
  vec3 c = mix(vCol.rgb * 0.8, vCol.rgb * 1.15 + vec3(0.05), lit * 0.7);
  oScene = vec4(c * a, a);
}`;

// ---------------------------------------------------------------------------------------------------------------------
// Lightning ribbons (additive): wide soft glow + coloured body + white-hot core, all from one strip.
export const BOLT_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aP;   // side, halfW, coreW, intensity
out vec4 vP;
${VIEW}
void main() { vP = aP; gl_Position = vec4(toClip(aPos), 0.0, 1.0); }`;

export const BOLT_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 1) out vec4 oEmit;
in vec4 vP;
uniform vec3 uCore;
uniform vec3 uGlow;
void main() {
  float dist = vP.x * vP.y;                       // distance from the centre line in scene units
  float cw = max(vP.z, 1e-5);
  float core = exp(-(dist * dist) / (cw * cw));
  float body = exp(-abs(dist) / (cw * 2.6));
  float halo = exp(-abs(dist) / (cw * 7.5));
  vec3 c = uGlow * (halo * 0.38 + body * 0.9) + mix(uGlow, uCore, 0.85) * core * 1.7;
  oEmit = vec4(c * vP.w, 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------------------
// Object layer: triangles textured with a transparent sprite (premultiplied alpha). Used for the intact object and for its fragments.
export const SHARD_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aE;   // edge (0 on the outer edge → 1 inside), brightness, rim glint, opacity
out vec2 vUV;
out vec4 vE;
${VIEW}
void main() { vUV = aUV; vE = aE; gl_Position = vec4(toClip(aPos), 0.0, 1.0); }`;

export const SHARD_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 oScene;
in vec2 vUV;
in vec4 vE;
uniform sampler2D uObj;
uniform vec3 uAccent;
uniform vec4 uTint;                                             // pieces of a screen: colour multiplier and frost amount
uniform float uGlass;                                           // 0 plain, 1 glass: each piece bends the picture a little differently, catches a sheen, darkens at its thick edge
${COMMON}
void main() {
  float fw = fwidth(vE.x);
  float cover = fw > 1e-6 ? clamp(vE.x / fw, 0.0, 1.0) : 1.0;   // analytic edge antialiasing from the triangle's edge coordinate
  vec2 guv = vUV;
  if (uGlass > 0.0) guv += (vec2(fract(vE.y * 91.7), fract(vE.y * 37.3)) - 0.5) * 0.028 * uGlass;      // refraction: a different offset for every piece
  vec4 t = texture(uObj, guv);                                  // premultiplied: only the object's own pixels, transparent elsewhere
  float k = vE.w * cover;
  vec3 c = t.rgb * vE.y * uTint.rgb;
  if (uTint.a > 0.0) c += vec3(0.75, 0.92, 1.0) * smoothstep(0.5, 0.78, fbm(vUV * vec2(40.0, 24.0) + fbm(vUV * 14.0) * 3.0)) * uTint.a * t.a;
  float rim = 1.0 - smoothstep(0.0, 0.22, vE.x);
  if (uGlass > 0.0) {
    float sheen = 0.5 + 0.5 * sin((vUV.x * 1.3 - vUV.y * 0.9) * 7.0 + vE.y * 23.0);
    c *= mix(vec3(1.0), vec3(0.9, 0.97, 1.03), uGlass) * (1.0 - 0.22 * rim * uGlass);
    c += vec3(0.88, 0.95, 1.0) * pow(sheen, 7.0) * 0.32 * uGlass * t.a;
    rim = 1.0 - smoothstep(0.0, 0.24, vE.x);
  }
  c += uAccent * rim * vE.z * t.a;                              // glint on the rim of a fragment, only where the sprite is opaque
  oScene = vec4(c * k, t.a * k);
}`;

// ---------------------------------------------------------------------------------------------------------------------
// Content layer: instanced textured quads. One instance = 24 floats:
//   aA  pivot x, pivot y, quad-centre offset x, y (scene units, relative to the pivot, before scale / rotation)
//   aB  half width, half height, rotation (rad), x-skew
//   aC  scale x, scale y, brightness, spare
//   aU  atlas uv rectangle (u0, v0, u1, v1)
//   aG  fill-space coordinates of the quad corners (g0, gv0, g1, gv1)
//   aT  tint (r, g, b, a)
export const ELEM_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aA;
layout(location = 2) in vec4 aB;
layout(location = 3) in vec4 aC;
layout(location = 4) in vec4 aU;
layout(location = 5) in vec4 aG;
layout(location = 6) in vec4 aT;
out vec2 vUV;
out vec2 vG;
out vec2 vL;
flat out vec4 vTint;
flat out float vBright;
flat out float vGlow;
${VIEW}
void main() {
  vec2 t = aCorner * 0.5 + 0.5;
  vec2 local = vec2(aA.z + (t.x * 2.0 - 1.0) * aB.x, aA.w + (t.y * 2.0 - 1.0) * aB.y);
  local.x += aB.w * local.y;
  local *= aC.xy;
  float c = cos(aB.z), s = sin(aB.z);
  vec2 w = aA.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vUV = mix(aU.xy, aU.zw, t);
  vG = mix(aG.xy, aG.zw, t);
  vL = t;
  vTint = aT; vBright = aC.z; vGlow = aC.w;
  gl_Position = vec4(toClip(w), 0.0, 1.0);
}`;

export const ELEM_FS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oEmit;
in vec2 vUV;
in vec2 vG;
in vec2 vL;
flat in vec4 vTint;
flat in float vBright;
flat in float vGlow;
uniform float uGlowLayer;   // 1 when this batch is a glow layer: the per-instance glow multiplier applies to it
uniform sampler2D uTex;
uniform sampler2D uLUT;
uniform vec4 uG0;       // kind (0 solid, 1 linear, 2 radial, 3 conic, 4 reflected), angle (rad), centre x, y
uniform vec4 uG1;       // scale, radius, repeat, reflect
uniform vec4 uG2;       // phase, wrap, box aspect, unused
uniform vec4 uG3;       // wave: amount, ripples, phase, on
uniform vec4 uMode;     // fill mode (0 texture, 1 texture x fill, 2 fill), texture premultiplied, emit mode (0 / 1 / 2), emit gain
uniform vec4 uFx;       // icon effect: mode, progress, seed, parameter
uniform vec3 uFxCol;
${COMMON}

float gradT(vec2 uv) {
  float kind = uG0.x, a = uG0.y;
  vec2 c = uG0.zw;
  float asp = uG2.z;
  vec2 p = vec2((uv.x - c.x) * asp, uv.y - c.y);
  float t = 0.5;
  if (kind > 0.5 && (kind < 1.5 || kind > 3.5)) {
    vec2 d = vec2(cos(a), sin(a));
    float L = abs(d.x) * asp + abs(d.y);
    t = dot(p, d) / (L * uG1.x) + 0.5;
    if (kind > 3.5) t = abs(2.0 * t - 1.0);
  } else if (kind > 1.5 && kind < 2.5) {
    float R = 0.5 * sqrt(asp * asp + 1.0);
    t = length(p) / (R * uG1.y * uG1.x);
  } else if (kind > 2.5 && kind < 3.5) {
    t = fract((atan(p.y, p.x) - a) / 6.2831853);
  }
  if (kind < 0.5) return 0.5;
  if (uG3.w > 0.5) {                                                    // wavy ramp: shift t by a ripple along the boundary direction
    float along;
    if (kind < 1.5 || kind > 3.5) {
      vec2 d = vec2(-sin(a), cos(a));
      float L = abs(d.x) * asp + abs(d.y);
      along = dot(p, d) / L + 0.5;
    } else if (kind < 2.5) along = atan(p.y, p.x) / 6.2831853;
    else along = length(p) / (0.5 * sqrt(asp * asp + 1.0));
    t += uG3.x * sin(6.2831853 * (uG3.y * along + uG3.z));
  }
  t = t * uG1.z + uG2.x;
  if (uG2.y > 0.5) t = uG1.w > 0.5 ? 1.0 - abs(mod(t, 2.0) - 1.0) : fract(t);
  return clamp(t, 0.0, 1.0);
}

void main() {
  vec2 uv = vUV;
  float fxA = 1.0;
  vec3 fxEmit = vec3(0.0);
  vec3 fxTint = vec3(1.0);
  int mode = int(uFx.x + 0.5);
  float pr = uFx.y, seed = uFx.z;
  if (mode != 0) {
    vec2 l = (vUV - 0.5);                                           // icon-relative coordinates (centre 0)
    if (mode == 1) {                                                // dissolve: noise threshold with a hot edge
      float n = fbm(vUV * 7.0 + seed) * 0.8 + (uFx.w > 0.0 ? (vUV.y - 0.5) * uFx.w : 0.0) * 0.4;
      float cut = pr * 1.25 - 0.12;
      fxA = smoothstep(cut - 0.015, cut + 0.03, n);
      float edge = (1.0 - smoothstep(0.0, 0.1, abs(n - cut - 0.04))) * step(0.001, pr) * (1.0 - smoothstep(0.85, 1.0, pr));
      fxEmit = uFxCol * edge * 1.8;
    } else if (mode == 2) {                                         // pixelate: blocks coarsen, then drop out one by one
      float cells = mix(220.0, 7.0, smoothstep(0.0, 0.55, pr));
      vec2 cell = floor(vUV * cells);
      uv = (cell + 0.5) / cells;
      float h = hash21(cell + seed);
      fxA = 1.0 - smoothstep(0.0, 0.12, pr * 1.3 - 0.25 - h * 0.9);
      fxEmit = uFxCol * (1.0 - smoothstep(0.0, 0.2, abs(pr * 1.3 - 0.25 - h * 0.9))) * 0.5 * step(0.3, pr);
    } else if (mode == 3) {                                         // slice: two halves slide apart along the cut
      float ang = uFx.w;
      vec2 nrm = vec2(-sin(ang), cos(ang));
      vec2 dir = vec2(cos(ang), sin(ang));
      float side = sign(dot(l, nrm) + 1e-5);
      float off = pr * 0.34;
      uv = vUV - side * (dir * off * 0.8 + nrm * off * 0.12) ;
      uv = vec2(uv.x, uv.y);
      float cutLine = abs(dot(vUV - 0.5, nrm));
      fxEmit = uFxCol * exp(-cutLine * 38.0) * (1.0 - smoothstep(0.2, 0.7, pr)) * step(0.001, pr) * 2.0;
      fxA = 1.0 - smoothstep(0.62, 1.0, pr);
    } else if (mode == 4) {                                         // melt: the icon sags and runs down
      float k = pr * pr;
      float col = hash11(floor(vUV.x * 22.0) + seed * 3.0);
      uv = vec2(vUV.x + sin(vUV.y * 14.0 + seed) * 0.02 * k, vUV.y - k * (0.25 + 0.9 * col) * clamp(1.0 - vUV.y * 0.0, 0.0, 1.0) * (1.0 - vUV.y * 0.55));
      fxA = 1.0 - smoothstep(0.55, 1.0, pr);
      fxTint = mix(vec3(1.0), uFxCol, smoothstep(0.0, 0.7, pr) * 0.6);
    } else if (mode == 5) {                                         // burn: a flame front climbs, leaving char and ash
      float n = fbm(vUV * 6.0 + seed) * 0.55 + (1.0 - vUV.y) * 0.6;
      float cut = pr * 1.25 - 0.1;
      fxA = smoothstep(cut - 0.01, cut + 0.02, n);
      float front = exp(-pow((n - cut - 0.04) * 22.0, 2.0));
      float char_ = smoothstep(cut, cut + 0.22, n);
      fxTint = vec3(mix(0.12, 1.0, char_ * char_));
      fxEmit = mix(uFxCol, vec3(1.0, 0.95, 0.7), front * 0.6) * front * 2.4 * step(0.001, pr) * (1.0 - smoothstep(0.9, 1.0, pr));
    } else if (mode == 6) {                                         // dust: pixels lift off in order and drift away
      float n = fbm(vUV * 9.0 + seed) * 0.5 + vUV.x * 0.5;
      float local = clamp((pr * 1.6 - n * 0.9) * 1.8, 0.0, 1.0);
      vec2 drift = vec2(0.55 + (hash21(floor(vUV * 40.0)) - 0.5) * 0.4, -0.35 + (vnoise(vUV * 12.0 + seed) - 0.5) * 0.6);
      uv = vUV - drift * local * local * 0.22;
      fxA = (1.0 - local) * (1.0 - smoothstep(0.0, 0.3, local) * 0.0);
      fxEmit = uFxCol * (1.0 - local) * local * 1.2;
    }
  }
  bool out_ = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
  vec4 t = out_ ? vec4(0.0) : texture(uTex, uv);
  if (mode == 8) {                                                  // vertical motion blur (a reel symbol at speed): p = half length of the smear, in sprite heights
    vec4 acc = vec4(0.0);
    for (int k = 0; k < 9; k++) {
      vec2 uk = vec2(uv.x, uv.y + (float(k) / 8.0 - 0.5) * 2.0 * uFx.w);
      acc += (uk.x < 0.0 || uk.y < 0.0 || uk.x > 1.0 || uk.y > 1.0) ? vec4(0.0) : texture(uTex, uk);
    }
    t = acc / 9.0;
  }
  vec3 rgb = uMode.y > 0.5 ? (t.a > 1e-4 ? t.rgb / t.a : vec3(0.0)) : t.rgb;
  float a = t.a;
  vec3 c = rgb;
  if (uMode.x > 0.5) {
    vec4 f = texture(uLUT, vec2(gradT(vG), 0.5));
    c = uMode.x < 1.5 ? rgb * f.rgb : f.rgb;
    a *= f.a;
  }
  a *= vTint.a * fxA;
  c *= vTint.rgb * fxTint * vBright;
  float gl = uGlowLayer > 0.5 ? vGlow : 1.0;
  if (uGlowLayer > 0.5 && uMode.z < 0.5) a = min(1.0, a * gl);
  vec3 light = c * a * uMode.w * (uGlowLayer > 0.5 ? gl : 1.0) + fxEmit * t.a;
  if (uMode.z < 0.5) { oColor = vec4(c * a, a); oEmit = vec4(fxEmit * t.a * vTint.a, 0.0); }
  else if (uMode.z < 1.5) { oColor = vec4(c * a, a); oEmit = vec4(light, 0.0); }
  else { oColor = vec4(0.0); oEmit = vec4(light, 0.0); }
}`;

// ---------------------------------------------------------------------------------------------------------------------
// Bloom + composite
export const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;   // texel step
void main() {
  vec3 s = texture(uTex, vUV).rgb * 0.2270270270;
  s += (texture(uTex, vUV + uDir * 1.3846153846).rgb + texture(uTex, vUV - uDir * 1.3846153846).rgb) * 0.3162162162;
  s += (texture(uTex, vUV + uDir * 3.2307692308).rgb + texture(uTex, vUV - uDir * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(s, 1.0);
}`;

export const DOWN_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec3 s = texture(uTex, vUV + uTexel * vec2(-0.5, -0.5)).rgb + texture(uTex, vUV + uTexel * vec2(0.5, -0.5)).rgb
         + texture(uTex, vUV + uTexel * vec2(-0.5, 0.5)).rgb + texture(uTex, vUV + uTexel * vec2(0.5, 0.5)).rgb;
  o = vec4(s * 0.25, 1.0);
}`;

export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uEmit;
uniform sampler2D uB0;
uniform sampler2D uB1;
uniform sampler2D uB2;
uniform float uBloom;
void main() {
  vec4 sc = texture(uScene, vUV);
  vec3 em = texture(uEmit, vUV).rgb;
  vec3 bl = texture(uB0, vUV).rgb * 0.34 + texture(uB1, vUV).rgb * 0.3 + texture(uB2, vUV).rgb * 0.2;
  vec3 add = max(em + bl * uBloom, 0.0);
  add = add / (1.0 + add * 0.22);                    // soft knee: stacked lights saturate gently instead of clipping to flat white
  // "screen"-style exponential roll-off: highlights approach white smoothly and hue survives instead of clipping.
  vec3 col = 1.0 - (1.0 - sc.rgb) * exp(-add * 1.35);
  // premultiplied output: where there is light but no picture (a transparent canvas) the light itself provides the coverage
  float a = max(sc.a, max(col.r, max(col.g, col.b)));
  o = vec4(min(col, vec3(a)), a);
}`;
