import type { Preset } from '../model/preset';
import { F, T, mo, motion, preset, scene, textIn, ts } from './kit';

const CAT = 'text-animations' as const;

const PL = 'Per letter', WT = 'Whole title', WL = 'Words and lines', DN = 'Digital and neon', PF = 'Playful';
const GROUP: Record<string, string> = {
  'pop-letters': PL, slam: WT, typewriter: DN, 'rise-wave': PL, 'bounce-drop': PL, scatter: PL, glitch: DN, 'neon-flicker': DN, 'swing-sign': PF, elastic: WT, 'spin-zoom': WT, 'word-slide': WL, tada: PF,
  'flip-letters': PL, 'arc-fly': WT, 'line-by-line': WL,
  domino: PL, swoop: PL, cascade: PL, 'zoom-through': PL, 'card-flip': PL, 'elastic-letters': PL, tumble: PL, ripple: PL, 'grow-up': PL, 'hanging-letters': PL, 'spread-out': PL, 'letters-jump': PF,
  whip: WT, blast: WT, 'rubber-drop': WT, meteor: WT, 'shake-in': WT, 'float-up': WT, 'italic-slide': WT, 'open-sideways': WT,
  'cyber-glitch': DN, 'neon-buzz': DN, freeze: PF, jackpot: PF, 'ko-punch': PF, 'wiggle-words': WL, 'cascade-lines': WL,
};

/** One title with its motion layers. Every preset enters, plays and leaves, so it loops cleanly. */
function anim(slug: string, name: string, description: string, text: string, styleId: string, m: ReturnType<typeof motion>, o: { size?: number; tags?: string[]; maxWidth?: number; group?: string } = {}): Preset {
  const title = T('title', text, { size: o.size ?? 0.2, style: ts(styleId), motion: m, maxWidth: o.maxWidth ?? 0 });
  return preset(CAT, slug, name, description, scene([title]), { tags: ['text', 'animation', ...(o.tags ?? [])], inputs: [textIn('title', 'Text')], group: GROUP[slug] ?? o.group });
}

export function textAnimations(): Preset[] {
  return [
    anim('pop-letters', 'Pop letters', 'Each letter pops up with a little overshoot, then the line floats gently and fades.', 'BIG WIN', 'gold-chunky', motion({
      entrance: mo.in('pop', { unit: 'char', stagger: 0.06, duration: 0.5 }), idle: mo.in('float', { start: 0.9 }), exit: mo.in('fade-out', { start: 2.7 }),
    })),
    anim('slam', 'Slam', 'The whole title crashes in from huge, hits hard and squashes, then jellies once.', 'MEGA WIN', 'comic-boom', motion({
      entrance: mo.in('slam'), emphasis: [mo.in('jelly', { start: 0.85 })], exit: mo.in('zoom-out', { start: 2.5 }),
    })),
    anim('typewriter', 'Typewriter', 'Letters strike one after another, each with a tiny hit of light.', 'FREE SPINS', 'pixel-arcade', motion({
      entrance: mo.in('typewriter', { unit: 'char', stagger: 0.07 }), exit: mo.in('blink-out', { start: 2.9 }),
    }), { size: 0.13 }),
    anim('rise-wave', 'Rise and wave', 'Letters rise into place, then a wave runs along the line until they sink away.', 'JACKPOT', 'candy-bubble', motion({
      entrance: mo.in('rise-letters', { unit: 'char', stagger: 0.05 }), idle: mo.in('wave', { start: 1, unit: 'char' }), exit: mo.in('wave-out', { start: 2.8, unit: 'char', stagger: 0.04 }),
    })),
    anim('bounce-drop', 'Bounce drop', 'Letters fall in one by one and bounce; a hit travels along the word.', 'BOUNCE', 'rainbow-pop', motion({
      entrance: mo.in('drop-letters', { unit: 'char', stagger: 0.08 }), emphasis: [mo.in('wave-hit', { start: 1.7, unit: 'char', stagger: 0.05 })], exit: mo.in('drop-out', { start: 2.7 }),
    })),
    anim('scatter', 'Scatter and assemble', 'Letters fly in from everywhere, spinning, and lock into the word; it then shimmers and bursts apart.', 'ASSEMBLE', 'chrome-impact', motion({
      entrance: mo.in('scatter-in', { unit: 'char', stagger: 0.03, order: 'random' }), idle: mo.in('shimmer', { start: 1.3, unit: 'char' }), exit: mo.in('explode-letters', { start: 3, unit: 'char' }),
    })),
    anim('glitch', 'Glitch', 'The title flickers into view like a corrupted signal, then jitters.', 'SYSTEM ERROR', 'sci-fi-hologram', motion({
      entrance: mo.in('glitch-in'), idle: mo.in('jitter', { start: 0.7 }), exit: mo.in('blink-out', { start: 2.6 }),
    }), { size: 0.14 }),
    anim('neon-flicker', 'Neon sign', 'Switches on with a stutter like a neon sign and keeps flickering.', 'OPEN 24/7', 'neon-sign', motion({
      entrance: mo.in('blink-in', { duration: 0.9 }), idle: mo.in('flicker', { start: 1 }), exit: mo.in('blink-out', { start: 3 }),
    }), { size: 0.17 }),
    anim('swing-sign', 'Swinging sign', 'Drops in swinging like a saloon sign and keeps rocking.', 'SALOON', 'western-wood', motion({
      entrance: mo.in('swing-in'), idle: mo.in('swing', { start: 1.2 }), exit: mo.in('slide-out-down', { start: 3 }),
    })),
    anim('elastic', 'Stretch and snap', 'Stretches out like rubber, snaps with a band, and squashes away.', 'STRETCH', 'fire-brand', motion({
      entrance: mo.in('stretch-in'), emphasis: [mo.in('rubber-band', { start: 1.3 })], exit: mo.in('squash-out', { start: 2.7 }),
    })),
    anim('spin-zoom', 'Spin and zoom', 'Spins in while growing, pulses, and spins away.', 'SPIN', 'alien-plasma', motion({
      entrance: mo.in('spin-in'), idle: mo.in('pulse', { start: 0.9 }), exit: mo.in('spin-out', { start: 2.6 }),
    })),
    anim('word-slide', 'Words slide in', 'Word by word, the line slides in from the side and slides out the other way.', 'SPIN TO WIN BIG', 'elegant-cabaret', motion({
      entrance: mo.in('slide-left', { unit: 'word', stagger: 0.2, duration: 0.6 }), exit: mo.in('slide-out-right', { start: 2.7, unit: 'word', stagger: 0.12 }),
    }), { size: 0.13 }),
    anim('tada', 'Tada', 'Pops in, does a happy wiggle twice, then the glow swells.', 'YOU DID IT', 'gold-chunky', motion({
      entrance: mo.in('pop', { duration: 0.5 }), emphasis: [mo.in('tada', { start: 0.7 }), mo.in('tada', { start: 1.8 }), mo.in('glow-pulse', { start: 1.2 })], exit: mo.in('fade-out', { start: 3 }),
    })),
    anim('flip-letters', 'Flip letters', 'Letters turn over like cards, one after another, then hover.', 'FLIP', 'ice-crystal', motion({
      entrance: mo.in('flip-in', { unit: 'char', stagger: 0.07 }), idle: mo.in('hover', { start: 1, unit: 'char', stagger: 0.1 }), exit: mo.in('shrink', { start: 2.8 }),
    })),
    anim('arc-fly', 'Fly in on an arc', 'Sweeps in along a curve, lands with a squash and a hop.', 'INCOMING', 'viking-stone', motion({
      entrance: mo.in('arc-in'), emphasis: [mo.in('pop-bounce', { start: 0.9 })], exit: mo.in('slide-out-up', { start: 2.7 }),
    })),
    anim('line-by-line', 'Line by line', 'Several lines slide up one after another and leave together.', 'MEGA\nSUPER\nWIN', 'neon-sign', motion({
      entrance: mo.in('slide-up', { unit: 'line', stagger: 0.28, duration: 0.55 }), idle: mo.in('breathe', { start: 1.2 }), exit: mo.in('fade-out', { start: 3 }),
    }), { size: 0.16, tags: ['multi-line'] }),

    // ---- more variation -------------------------------------------------------------------------------------------
    anim('domino', 'Domino', 'Letters tip over into place one after another; a hop runs along the word; then they topple away.', 'DOMINO', 'ruby', motion({
      entrance: mo.in('domino-in'), idle: mo.in('hop-wave', { start: 1.1 }), exit: mo.in('domino-out', { start: 3 }),
    })),
    anim('swoop', 'Swoop', 'Every letter swoops up along a curve and lands with a hop; light twinkles across them; they sweep away.', 'MAX WIN', 'gold-two-tone', motion({
      entrance: mo.in('swoop-in'), idle: mo.in('twinkle', { start: 1, duration: 1.8 }), exit: mo.in('swoop-out', { start: 3 }),
    })),
    anim('cascade', 'Cascade', 'Letters fall in from above with a small tilt and wobble like jelly, then fall away.', 'CASCADE', 'sapphire', motion({
      entrance: mo.in('cascade-in'), idle: mo.in('jelly-wobble', { start: 1.1 }), exit: mo.in('fall-letters', { start: 3 }),
    })),
    anim('zoom-through', 'Zoom through', 'Letters rush in from the viewer one by one; a spotlight runs along; the line flares out.', 'MEGA WIN', 'candy-green', motion({
      entrance: mo.in('zoom-letters'), emphasis: [mo.in('spotlight', { start: 0.9 })], exit: mo.in('blast-out', { start: 2.9 }),
    })),
    anim('card-flip', 'Card flip', 'Letters turn over like cards; a wave of half-turns follows; they flip away.', 'FLIP', 'steel-blue', motion({
      entrance: mo.in('card-flip-in'), idle: mo.in('flip-wave', { start: 1.1 }), exit: mo.in('flip-out-letters', { start: 3 }),
    })),
    anim('elastic-letters', 'Boing', 'Every letter springs up and wobbles; a squash wave rolls through; the line is sucked down a drain.', 'BOING', 'toxic-slime', motion({
      entrance: mo.in('elastic-letters'), idle: mo.in('squash-wave', { start: 1.1 }), exit: mo.in('suck-in', { start: 3 }),
    })),
    anim('tumble', 'Tumble', 'Letters tumble down spinning and land upright, then swing like tags and scatter.', 'TUMBLE', 'toy-block', motion({
      entrance: mo.in('tumble-in'), idle: mo.in('pendulum', { start: 1.2 }), exit: mo.in('scatter-out', { start: 3 }),
    })),
    anim('ripple', 'Ripple', 'Letters rise through a ripple, keep waving, and lift off one by one.', 'RIPPLE', 'glass-aqua', motion({
      entrance: mo.in('ripple-in'), idle: mo.in('wave', { start: 1.1, unit: 'char' }), exit: mo.in('rise-fade-letters', { start: 3 }),
    })),
    anim('grow-up', 'Grow up', 'Letters grow upward from the baseline with a spring; twinkling; then the line closes down.', 'GROW', 'wild-lime-gold', motion({
      entrance: mo.in('grow-up'), idle: mo.in('twinkle', { start: 0.9, duration: 2 }), exit: mo.in('curtain-down', { start: 3 }),
    })),
    anim('hanging-letters', 'Hanging letters', 'Letters drop in on ropes and swing, each at its own pace, then fall.', 'HANG ON', 'sticker-pink', motion({
      entrance: mo.in('hang-in'), idle: mo.in('pendulum', { start: 1.4 }), exit: mo.in('fall-letters', { start: 3.1 }),
    }), { size: 0.17 }),
    anim('spread-out', 'Spread out', 'Letters start bunched at the centre and spread to their places; the line levitates; it zips shut.', 'SPREAD', 'royal-purple', motion({
      entrance: mo.in('track-in'), idle: mo.in('levitate', { start: 0.9 }), exit: mo.in('zip-out', { start: 3 }),
    })),
    anim('letters-jump', 'Letters jump', 'Letters pop in, then jump one after another, twice, and float off.', 'JUMP', 'sticker-mint', motion({
      entrance: mo.in('pop', { unit: 'char', stagger: 0.06, duration: 0.45 }), emphasis: [mo.in('letters-jump', { start: 0.9 }), mo.in('letters-jump', { start: 1.9 })], exit: mo.in('float-away', { start: 3.1 }),
    })),

    anim('whip', 'Whip', 'Lashes in from the edge, skewed, snaps straight, shakes, and leaves the other way.', 'FAST', 'fire-brand', motion({
      entrance: mo.in('whip-in'), emphasis: [mo.in('skew-shake', { start: 0.7 })], exit: mo.in('slide-out-right', { start: 2.8, params: { fromEdge: 'true' } }),
    })),
    anim('blast', 'Blast', 'Bursts past full size in a bright flash, breathes, then flares out like a flash bulb.', 'BLAST', 'magma', motion({
      entrance: mo.in('blast-in'), idle: mo.in('breathe', { start: 0.8 }), exit: mo.in('blast-out', { start: 2.9 }),
    })),
    anim('rubber-drop', 'Rubber drop', 'Falls stretched, squashes flat on landing and wobbles back; later squashes away.', 'DROP', 'chocolate', motion({
      entrance: mo.in('rubber-drop'), idle: mo.in('jelly-wobble', { start: 1.1, unit: 'block' }), exit: mo.in('squash-out', { start: 2.9 }),
    })),
    anim('meteor', 'Meteor', 'Streaks in from the corner, hits with a flash and a squash, shakes, and drops out.', 'IMPACT', 'viking-stone', motion({
      entrance: mo.in('meteor-in'), emphasis: [mo.in('emph-shake', { start: 0.75 })], exit: mo.in('drop-out', { start: 2.8 }),
    }), { size: 0.17 }),
    anim('shake-in', 'Shake in', 'Appears huge and shaking, shrinks to size as the shaking dies, shivers, then glitches out.', 'ALERT', 'horror-blood', motion({
      entrance: mo.in('shake-in'), idle: mo.in('shiver', { start: 0.8 }), exit: mo.in('glitch-out', { start: 2.9 }),
    })),
    anim('float-up', 'Float up', 'Drifts up softly while fading in, levitates, and floats away: the quiet one.', 'Serenity', 'elegant-cabaret', motion({
      entrance: mo.in('float-up'), idle: mo.in('levitate', { start: 1 }), exit: mo.in('float-away', { start: 3 }),
    }), { size: 0.2 }),
    anim('italic-slide', 'Italic slide', 'Slides in leaning hard and straightens, sways, then slides out.', 'SPEED', 'retro-sunset', motion({
      entrance: mo.in('italic-slide'), idle: mo.in('sway', { start: 0.8 }), exit: mo.in('slide-out-right', { start: 2.9 }),
    })),
    anim('open-sideways', 'Open sideways', 'Letters open from a vertical line to full width; light shimmers over them; they zip shut.', 'OPEN', 'bronze', motion({
      entrance: mo.in('unfold-x'), idle: mo.in('shimmer', { start: 0.9, unit: 'char' }), exit: mo.in('zip-out', { start: 3 }),
    })),

    anim('cyber-glitch', 'Cyber glitch', 'Glitches in, takes two bursts of corruption, then breaks up and cuts out.', 'CYBER', 'sci-fi-hologram', motion({
      entrance: mo.in('glitch-in'), emphasis: [mo.in('glitch-hit', { start: 1 }), mo.in('glitch-hit', { start: 2.1 })], exit: mo.in('glitch-out', { start: 3 }),
    })),
    anim('neon-buzz', 'Neon buzz', 'A neon sign switches on and buzzes with the odd dropout.', 'LIVE', 'neon-sign', motion({
      entrance: mo.in('blink-in', { duration: 0.9 }), idle: mo.in('neon-buzz', { start: 0.9, unit: 'char' }), exit: mo.in('blink-out', { start: 3 }),
    })),
    anim('freeze', 'Freeze', 'Floats in cold, shivers, and the letters lift off and fade one by one.', 'FREEZE', 'frost-white', motion({
      entrance: mo.in('float-up'), idle: mo.in('shiver', { start: 0.9 }), exit: mo.in('rise-fade-letters', { start: 3 }),
    })),
    anim('jackpot', 'Jackpot blink', 'Pops in, blinks with light twice, and shrinks away.', 'JACKPOT', 'gold-chunky', motion({
      entrance: mo.in('pop', { duration: 0.5 }), emphasis: [mo.in('blink-flash', { start: 0.8 }), mo.in('blink-flash', { start: 1.7 }), mo.in('glow-pulse', { start: 2.3 })], exit: mo.in('shrink', { start: 3.1 }),
    })),
    anim('ko-punch', 'Knock-out', 'Slams in, then punches toward the viewer twice.', 'K.O.!', 'comic-boom', motion({
      entrance: mo.in('slam'), emphasis: [mo.in('zoom-punch', { start: 0.9 }), mo.in('zoom-punch', { start: 1.7 })], exit: mo.in('zoom-out', { start: 2.7 }),
    })),
    anim('wiggle-words', 'Wiggle words', 'Words arrive from the sides in turn, wiggle, and leave in turn.', 'SPIN TO WIN', 'sticker-pink', motion({
      entrance: mo.in('slide-right', { unit: 'word', stagger: 0.22, duration: 0.55 }), emphasis: [mo.in('wiggle', { start: 1, unit: 'word', stagger: 0.15 })], exit: mo.in('slide-out-left', { start: 2.8, unit: 'word', stagger: 0.12 }),
    }), { size: 0.15 }),
    anim('cascade-lines', 'Cascading lines', 'Lines drop in one after another with a bounce and fade out together.', 'COINS\nGEMS\nGOLD', 'candy-green', motion({
      entrance: mo.in('bounce-drop', { unit: 'line', stagger: 0.3, duration: 0.8 }), idle: mo.in('breathe', { start: 1.4 }), exit: mo.in('fade-out', { start: 3.2 }),
    }), { size: 0.15, tags: ['multi-line'] }),
  ];
}
void F;

const CALM = 'Calm and clean: for messages and titles';
/** A title, and optionally a smaller line under it, with quiet motion: nothing overshoots, spins or shakes. */
function calm(slug: string, name: string, description: string, text: string, styleId: string, m: ReturnType<typeof motion>, o: { size?: number; sub?: { text: string; style?: string; size?: number; motion: ReturnType<typeof motion> }; maxWidth?: number; y?: number; tags?: string[] } = {}): Preset {
  const title = T('title', text, { size: o.size ?? 0.13, style: ts(styleId), motion: m, maxWidth: o.maxWidth ?? 0, y: o.sub ? 0.45 : (o.y ?? 0.5) });
  const els = [title, ...(o.sub ? [T('subtitle', o.sub.text, { role: 'subtitle', name: 'Subtitle', size: o.sub.size ?? 0.055, y: 0.6, style: ts(o.sub.style ?? 'clean-white'), motion: o.sub.motion })] : [])];
  return preset(CAT, slug, name, description, scene(els), { tags: ['text', 'animation', 'calm', ...(o.tags ?? [])], inputs: [textIn('title', 'Text'), ...(o.sub ? [textIn('subtitle', 'Subtitle')] : [])], group: CALM });
}

export function calmAnimations(): Preset[] {
  return [
    calm('calm-drift', 'Drift and fade', 'The title drifts a short way into place while fading in, glows slowly, and drifts away.', 'FREE SPINS', 'ornate-gold', motion({
      entrance: mo.in('drift-fade'), idle: mo.in('slow-glow', { start: 0.9 }), exit: mo.in('drift-fade-out', { start: 3.2 }),
    })),
    calm('calm-track', 'Tracking in', 'The letters draw together from a wide spacing into the word while fading in, then spread and fade.', 'BONUS ROUND', 'steel-badge', motion({
      entrance: mo.in('tracking-in', { unit: 'char', duration: 1.1 }), idle: mo.in('drift', { start: 1 }), exit: mo.in('tracking-out', { start: 3.2, unit: 'char' }),
    }), { size: 0.12 }),
    calm('calm-soft', 'Soft scale', 'A plain white line grows from just under full size while fading in and eases out again.', 'WELL PLAYED', 'clean-white', motion({
      entrance: mo.in('soft-scale'), exit: mo.in('soft-scale-out', { start: 3 }),
    }), { size: 0.11 }),
    calm('calm-focus', 'Focus in', 'The title arrives a little large and bright and settles into focus, with one pass of light along it.', 'LEVEL UP', 'ornate-silver', motion({
      entrance: mo.in('focus-in'), emphasis: [mo.in('glint-pass', { start: 1.1, unit: 'char' })], exit: mo.in('soft-scale-out', { start: 3 }),
    })),
    calm('calm-letters', 'Letter reveal', 'Letters fade in along the line, each rising a hair, and fade out the same way.', 'THE TREASURE ROOM', 'ornate-gold', motion({
      entrance: mo.in('letter-reveal', { unit: 'char', stagger: 0.045 }), idle: mo.in('slow-glow', { start: 1.6 }), exit: mo.in('letter-fade-out', { start: 3.3, unit: 'char' }),
    }), { size: 0.09 }),
    calm('calm-settle', 'Settle', 'Drops a short way and settles with one soft overshoot and a small dip.', 'WELCOME', 'carved-gold', motion({
      entrance: mo.in('settle-drop'), emphasis: [mo.in('settle-bob', { start: 1.3 })], exit: mo.in('sink-fade', { start: 3.1 }),
    })),
    calm('calm-light', 'Light up', 'Fades in from dark while the glow swells and eases back, like a lamp being turned up.', 'NEW FEATURE', 'violet-metal', motion({
      entrance: mo.in('light-up'), idle: mo.in('slow-glow', { start: 1.1 }), exit: mo.in('drift-fade-out', { start: 3.2 }),
    }), { size: 0.12 }),
    calm('calm-blind', 'Unfold down', 'Opens downward from a line, the way a blind is let down.', 'TAP TO CONTINUE', 'clean-white', motion({
      entrance: mo.in('unfold-down'), idle: mo.in('drift', { start: 1 }), exit: mo.in('soft-scale-out', { start: 3 }),
    }), { size: 0.09 }),
    calm('calm-title-sub', 'Title and subtitle', 'A title drifts in, a smaller line follows a beat later: the standard message.', 'SUPER BONUS', 'ornate-gold', motion({
      entrance: mo.in('drift-fade'), idle: mo.in('slow-glow', { start: 1 }), exit: mo.in('drift-fade-out', { start: 3.4 }),
    }), { size: 0.12, sub: { text: 'Pick a treasure to begin', motion: motion({ entrance: mo.in('drift-fade', { start: 0.35, duration: 0.7 }), exit: mo.in('drift-fade-out', { start: 3.4 }) }) } }),
    calm('calm-title-sub-track', 'Wide title, quiet subtitle', 'The title tracks in from a wide spacing; a thin subtitle fades in beneath it.', 'BIG WIN', 'steel-badge', motion({
      entrance: mo.in('tracking-in', { unit: 'char', duration: 1.1 }), exit: mo.in('tracking-out', { start: 3.4, unit: 'char' }),
    }), { size: 0.14, sub: { text: 'YOU HAVE WON', size: 0.045, motion: motion({ entrance: mo.in('drift-fade', { start: 0.5, duration: 0.7 }), exit: mo.in('drift-fade-out', { start: 3.4 }) }) } }),
    calm('calm-words', 'Word by word', 'Words fade in one after another, each drifting up a little.', 'COLLECT THREE SCATTERS TO WIN THE BONUS', 'clean-white', motion({
      entrance: mo.in('drift-fade', { unit: 'word', stagger: 0.18, duration: 0.7 }), exit: mo.in('drift-fade-out', { start: 3.6 }),
    }), { size: 0.08, maxWidth: 0.55, tags: ['multi-line'] }),
    calm('calm-lines', 'Line by line', 'Lines drift in one after another and leave together.', 'THE QUEST BEGINS\nCOLLECT THE RELICS\nSURVIVE THE NIGHT', 'ornate-gold', motion({
      entrance: mo.in('drift-fade', { unit: 'line', stagger: 0.28, duration: 0.8 }), exit: mo.in('drift-fade-out', { start: 3.6 }),
    }), { size: 0.075, tags: ['multi-line'] }),
    calm('calm-alternate', 'Alternate slide', 'Lines slip in from the left and the right in turn while fading in.', 'YOU HAVE WON\n10 FREE SPINS', 'ornate-gold', motion({
      entrance: mo.in('alternate-slide', { unit: 'line', stagger: 0.2 }), exit: mo.in('drift-fade-out', { start: 3.4 }),
    }), { size: 0.09, tags: ['multi-line'] }),
    calm('calm-nudge', 'Nudge', 'Arrives softly, then gives two small beats to draw the eye.', 'MULTIPLIER ACTIVE', 'ornate-ruby', motion({
      entrance: mo.in('soft-scale'), emphasis: [mo.in('nudge', { start: 1.2 }), mo.in('nudge', { start: 2.3 })], exit: mo.in('soft-scale-out', { start: 3.4 }),
    }), { size: 0.085 }),
    calm('calm-glow-pass', 'Glow pass', 'Light travels once along the letters, twice, and the title leaves with a soft fade.', 'JACKPOT', 'carved-gold', motion({
      entrance: mo.in('drift-fade'), emphasis: [mo.in('glint-pass', { start: 1.1, unit: 'char' }), mo.in('glint-pass', { start: 2.4, unit: 'char' })], exit: mo.in('sink-fade', { start: 3.4 }),
    })),
    calm('calm-hush', 'Hush', 'A slow, plain fade for a quiet prompt, with a barely-there drift while it waits.', 'SPIN TO WIN', 'frost-white', motion({
      entrance: mo.in('fade-in', { duration: 1.2 }), idle: mo.in('drift', { start: 1.2 }), exit: mo.in('fade-out', { start: 3.4, duration: 0.8 }),
    }), { size: 0.12 }),
    calm('calm-game-title', 'Game title', 'A game title that arrives quietly and floats: for a loading or start screen.', 'MUSHROOM', 'title-pink', motion({
      entrance: mo.in('soft-scale', { duration: 0.9 }), idle: mo.in('drift', { start: 0.9 }), exit: mo.in('soft-scale-out', { start: 3.4 }),
    }), { size: 0.15 }),
    calm('calm-slab', 'Slab cut-in', 'Heavy slanted capitals slide in from one side and out the other: a tidy cut for a ticker.', 'NICE WIN', 'slab-white', motion({
      entrance: mo.in('slide-right', { duration: 0.5 }), exit: mo.in('slide-out-right', { start: 3 }),
    }), { size: 0.16 }),
  ];
}
