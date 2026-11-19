import { num } from '../../core/params';
import { n, type ShowEffect } from './effect';
import type { Frame } from '../engine/frame';
import { smoothstep } from '../engine/math';

const G = (group: string) => ({ section: 'Effect', group });

/**
 * Screen shake: a decaying, two-frequency camera shake of the whole picture and every layer on it. The camera zooms in just enough
 * (in step with the shake) that the picture always covers its own frame, so no edge is ever exposed, and it returns to exactly 1×.
 */
export const shake: ShowEffect = {
  id: 'shake',
  name: 'Screen Shake',
  tagline: 'A decaying camera shake of the whole scene.',
  category: 'primitive',
  params: [
    num('amplitude', 'Amplitude', G('Shake'), 0.012, 0, 0.04, 0.0005, '', 'Peak camera travel in image heights (0.005 ≈ subtle, 0.02 ≈ strong).'),
    num('rotation', 'Roll', G('Shake'), 0.4, 0, 2, 0.01, 'deg', 'Peak camera roll in degrees.'),
    num('frequency', 'Frequency', G('Shake'), 26, 8, 48, 1, 'hz', 'How fast the camera shakes.'),
    num('decay', 'Decay', G('Shake'), 1.8, 0.8, 4, 0.05, '', 'How quickly the shake dies away (higher = shorter, snappier).'),
    num('duration', 'Duration', G('Timing'), 0.4, 0.1, 6, 0.01, 's', 'Total length.'),
  ],
  duration: (p) => n(p, 'duration'),
  impactAt: () => 0,
  cues: (p) => [{ t: 0, kind: 'rumble', gain: 0.35 + n(p, 'amplitude') * 12, dur: Math.max(0.2, n(p, 'duration') * 0.8), pitch: 1.2 }],
  companion: { subtle: { amplitude: 0.005, rotation: 0.15, frequency: 28, decay: 2.2, duration: 0.3 }, scale: (p, k) => ({ ...p, amplitude: n(p, 'amplitude') * k, rotation: n(p, 'rotation') * k }) },
  build(f: Frame, t: number, p) {
    const D = n(p, 'duration');
    if (t < 0 || t >= D) return;
    const A = n(p, 'amplitude'), R = (n(p, 'rotation') * Math.PI) / 180, fq = n(p, 'frequency') * Math.PI * 2;
    const e = Math.max(0, 1 - t / D) ** n(p, 'decay') * smoothstep(0, 0.012, t);
    const w1 = Math.sin(fq * t), w2 = Math.sin(fq * 1.73 * t + 1.3);
    const dx = A * e * (0.7 * w1 + 0.3 * w2), dy = A * e * (0.7 * Math.sin(fq * 0.91 * t + 2.1) + 0.3 * Math.sin(fq * 2.1 * t));
    const rot = R * e * Math.sin(fq * 0.77 * t + 0.6);
    // zoom so that the translated, rolled picture still covers its frame
    const zoom = 1 + 2.4 * A * e + 2.0 * Math.abs(R) * e;
    f.camera = { dx: f.camera.dx + dx, dy: f.camera.dy + dy, rot: f.camera.rot + rot, zoom: 1 + (f.camera.zoom - 1) + (zoom - 1) };
  },
};
