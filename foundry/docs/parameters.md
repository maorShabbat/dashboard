# Parameter reference

> Generated from the parameter definitions by `npm run bangers -- docs docs/parameters.md`. A test fails when this file is out of date.

Every adjustable value has a default, bounds, a unit and a description. Lengths in **% cell** are percentages of one board cell, so they scale with the board and viewport.

## Theme tokens (200)

Layer 1 of the inheritance chain (BANGERS defaults). A theme overrides any of these keys.

### Colour roles (17)

Semantic roles. Effects reference roles (e.g. "win"), never raw hex, so one edit re-colours everything.

**Stage**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `color.background` | Background | `#140b2e` | hex colour or colour role |  | Stage background behind the board. |
| `color.backgroundAlt` | Background (alt) | `#2a1458` | hex colour or colour role |  | Second stop of the stage gradient. |

**Surfaces**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `color.surface` | Surface | `#241447` | hex colour or colour role |  | Plates, banners and the board bed. |
| `color.surfaceAlt` | Surface (alt) | `#38206b` | hex colour or colour role |  | Secondary surface / gradient end and cell fill. |

**Brand**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `color.primary` | Primary | `#ff3d6e` | hex colour or colour role |  | Brand colour: frame, key badges. |
| `color.secondary` | Secondary | `#2fd6ff` | hex colour or colour role |  | Cool counterpoint to primary. |
| `color.accent` | Accent | `#ffd23f` | hex colour or colour role |  | Highlights and attention. |

**Feedback**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `color.win` | Win | `#ffe14d` | hex colour or colour role |  | Win celebration colour. |
| `color.success` | Success | `#3be88a` | hex colour or colour role |  | Positive confirmation. |
| `color.danger` | Danger | `#ff4d4d` | hex colour or colour role |  | Warnings and negative states. |
| `color.info` | Info | `#7a8cff` | hex colour or colour role |  | Neutral informational highlight. |

**Text**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `color.text` | Text | `#fff7e6` | hex colour or colour role |  | Primary text on surfaces. |
| `color.textMuted` | Text (muted) | `#b9aedb` | hex colour or colour role |  | Secondary text. |
| `color.textOnAccent` | Text on accent | `#1a0f2e` | hex colour or colour role |  | Text drawn on accent/win colours. |

**Strokes & shadow**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `color.outline` | Outline | `#0b0618` | hex colour or colour role |  | Default outline / extrusion colour. |
| `color.glow` | Glow | `#ffb800` | hex colour or colour role |  | Default glow colour. |
| `color.shadow` | Shadow | `#000000` | hex colour or colour role |  | Drop shadow colour. |

### Typography (31)

Five typographic roles. Sizes are board-aware: they are a percentage of one board cell.

**Display**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `type.display.family` | Font family | `bangers` | font id |  | Font used by this role. Only fonts whose licence permits it are packaged into bundles. |
| `type.display.weight` | Weight | `400` | 100 – 900 |  | CSS weight; the nearest available file weight is used. |
| `type.display.size` | Size | `90` | 4 – 400 | % cell | Font size as a percentage of one board cell, so type scales with the board. |
| `type.display.letterSpacing` | Letter spacing | `0.04` | -0.1 – 0.5 | em | Extra tracking. |
| `type.display.lineHeight` | Line height | `1` | 0.8 – 2 | ratio | Line height multiplier. |
| `type.display.transform` | Case | `uppercase` | `none` · `uppercase` · `lowercase` |  | Text case applied at render time. |

**Headline**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `type.headline.family` | Font family | `anton` | font id |  | Font used by this role. Only fonts whose licence permits it are packaged into bundles. |
| `type.headline.weight` | Weight | `400` | 100 – 900 |  | CSS weight; the nearest available file weight is used. |
| `type.headline.size` | Size | `55` | 4 – 400 | % cell | Font size as a percentage of one board cell, so type scales with the board. |
| `type.headline.letterSpacing` | Letter spacing | `0.03` | -0.1 – 0.5 | em | Extra tracking. |
| `type.headline.lineHeight` | Line height | `1.05` | 0.8 – 2 | ratio | Line height multiplier. |
| `type.headline.transform` | Case | `uppercase` | `none` · `uppercase` · `lowercase` |  | Text case applied at render time. |

**Body**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `type.body.family` | Font family | `inter` | font id |  | Font used by this role. Only fonts whose licence permits it are packaged into bundles. |
| `type.body.weight` | Weight | `400` | 100 – 900 |  | CSS weight; the nearest available file weight is used. |
| `type.body.size` | Size | `22` | 4 – 400 | % cell | Font size as a percentage of one board cell, so type scales with the board. |
| `type.body.letterSpacing` | Letter spacing | `0` | -0.1 – 0.5 | em | Extra tracking. |
| `type.body.lineHeight` | Line height | `1.3` | 0.8 – 2 | ratio | Line height multiplier. |
| `type.body.transform` | Case | `none` | `none` · `uppercase` · `lowercase` |  | Text case applied at render time. |

**Numeric**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `type.numeric.family` | Font family | `roboto-mono` | font id |  | Font used by this role. Only fonts whose licence permits it are packaged into bundles. |
| `type.numeric.weight` | Weight | `700` | 100 – 900 |  | CSS weight; the nearest available file weight is used. |
| `type.numeric.size` | Size | `70` | 4 – 400 | % cell | Font size as a percentage of one board cell, so type scales with the board. |
| `type.numeric.letterSpacing` | Letter spacing | `0` | -0.1 – 0.5 | em | Extra tracking. |
| `type.numeric.lineHeight` | Line height | `1` | 0.8 – 2 | ratio | Line height multiplier. |
| `type.numeric.transform` | Case | `none` | `none` · `uppercase` · `lowercase` |  | Text case applied at render time. |

**Label**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `type.label.family` | Font family | `inter` | font id |  | Font used by this role. Only fonts whose licence permits it are packaged into bundles. |
| `type.label.weight` | Weight | `700` | 100 – 900 |  | CSS weight; the nearest available file weight is used. |
| `type.label.size` | Size | `16` | 4 – 400 | % cell | Font size as a percentage of one board cell, so type scales with the board. |
| `type.label.letterSpacing` | Letter spacing | `0.08` | -0.1 – 0.5 | em | Extra tracking. |
| `type.label.lineHeight` | Line height | `1.1` | 0.8 – 2 | ratio | Line height multiplier. |
| `type.label.transform` | Case | `uppercase` | `none` · `uppercase` · `lowercase` |  | Text case applied at render time. |

**Legibility**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `type.minSizePx` | Minimum text size | `11` | 6 – 24 | px | Text never renders smaller than this, whatever the board size. |

### Surface (9)

Plates, banners and callouts: fill, gradient, corner radius and texture.

**Plate**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `surface.fill` | Fill | → `color.surface` | hex colour or colour role |  | Plate fill (gradient start). |
| `surface.fillAlt` | Fill (gradient end) | → `color.surfaceAlt` | hex colour or colour role |  | Plate gradient end. |
| `surface.gradientAngle` | Gradient angle | `160` | 0 – 360 | ° | Direction of the fill gradient. |
| `surface.opacity` | Opacity | `94` | 0 – 100 | % | Plate opacity. |
| `surface.cornerRadius` | Corner radius | `14` | 0 – 50 | % cell | Rounded corner size. |
| `surface.padding` | Padding | `12` | 0 – 60 | % cell | Inner padding around plate content. |

**Texture**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `surface.texture` | Texture | `halftone` | `none` · `halftone` · `stripes` · `grid` |  | Procedural pattern drawn over the plate. |
| `surface.textureOpacity` | Texture opacity | `14` | 0 – 100 | % | Pattern strength. _(only when `surface.texture` is `halftone` / `stripes` / `grid`)_ |
| `surface.textureScale` | Texture scale | `8` | 2 – 40 | % cell | Pattern spacing. _(only when `surface.texture` is `halftone` / `stripes` / `grid`)_ |

### Outline (6)

Stroke and glow shared by highlights, plates and text.

**Stroke**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `outline.color` | Colour | → `color.outline` | hex colour or colour role |  | Stroke colour. |
| `outline.width` | Width | `4` | 0 – 20 | % cell | Stroke width. |
| `outline.style` | Style | `solid` | `solid` · `dashed` · `double` |  | Stroke style. |

**Glow**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `outline.glowColor` | Glow colour | → `color.glow` | hex colour or colour role |  | Glow colour. |
| `outline.glowBlur` | Glow blur | `14` | 0 – 60 | % cell | Glow radius. |
| `outline.glowStrength` | Glow strength | `55` | 0 – 100 | % | Glow opacity. |

### Depth (8)

Drop shadow, comic extrusion and bevel.

**Drop shadow**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `depth.shadowColor` | Colour | → `color.shadow` | hex colour or colour role |  | Drop shadow colour. |
| `depth.shadowOpacity` | Opacity | `55` | 0 – 100 | % | Drop shadow opacity. |
| `depth.shadowOffsetX` | Offset X | `0` | -40 – 40 | % cell | Horizontal shadow offset. |
| `depth.shadowOffsetY` | Offset Y | `8` | -40 – 40 | % cell | Vertical shadow offset. |
| `depth.shadowBlur` | Blur | `14` | 0 – 60 | % cell | Shadow softness. |

**Extrusion & bevel**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `depth.extrude` | Text extrusion | `6` | 0 – 30 | % cell | Comic-book extrusion depth behind text and plates. |
| `depth.extrudeColor` | Extrusion colour | → `color.outline` | hex colour or colour role |  | Colour of the extrusion. |
| `depth.bevel` | Bevel highlight | `35` | 0 – 100 | % | Top-edge highlight strength on plates. |

### Motion personality (7)

Explicit easing and timing numbers. A personality button only fills these in; nothing is inferred from names.

**Curve**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `motion.easing` | Easing | `easeOutBack` | `linear` · `easeOutQuad` · `easeOutCubic` · `easeInOutCubic` · `easeOutBack` · `easeOutElastic` · `easeOutBounce` · `spring` |  | Default easing for effects whose own easing is "theme". |
| `motion.overshoot` | Overshoot | `1.70158` | 0 – 4 | ratio | Back/elastic overshoot amount (1.7 ≈ classic 10%). _(only when `motion.easing` is `easeOutBack` / `easeOutElastic`)_ |
| `motion.springFrequency` | Spring frequency | `2.5` | 0.5 – 6 | ratio | Oscillations across an effect. _(only when `motion.easing` is `spring`)_ |
| `motion.springDamping` | Spring damping | `0.45` | 0.05 – 1 | ratio | Damping ratio; 1 is critical (no bounce). _(only when `motion.easing` is `spring`)_ |

**Timing**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `motion.durationScale` | Duration scale | `1` | 0.25 – 3 | × | Multiplies every effect duration. <1 snappier, >1 weightier. |
| `motion.staggerScale` | Stagger scale | `1` | 0 – 3 | × | Multiplies per-cell and per-instance stagger delays. |
| `motion.anticipation` | Anticipation | `12` | 0 – 40 | % | Wind-up share of pop-in animations (scale dips before it grows). |

### Intensity & safety (13)

Default strength per effect family, win tiers, reduced-motion and photosensitivity limits.

**Family defaults**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `intensity.master` | Master | `1` | 0 – 2 | ratio | Scales every effect. |
| `intensity.shake` | Shake | `1` | 0 – 2 | ratio | Default strength of camera shake. |
| `intensity.flash` | Flash | `1` | 0 – 2 | ratio | Default strength of screen flashes. |
| `intensity.particles` | Particles | `1` | 0 – 2 | ratio | Default particle count/energy. |
| `intensity.glow` | Glow & highlight | `1` | 0 – 2 | ratio | Default strength of glows, outlines and sweeps. |
| `intensity.text` | Text & badges | `1` | 0 – 2 | ratio | Default pop strength of banners and callouts. |
| `intensity.motion` | Symbol motion | `1` | 0 – 2 | ratio | Default amplitude of cascades. |

**Win tiers**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `intensity.tierBig` | Tier · big | `1` | 0 – 3 | ratio | Intensity multiplier for BIG WIN banners. |
| `intensity.tierMega` | Tier · mega | `1.4` | 0 – 3 | ratio | Intensity multiplier for MEGA WIN banners. |
| `intensity.tierEpic` | Tier · epic | `1.8` | 0 – 3 | ratio | Intensity multiplier for EPIC WIN banners. |

**Safety & accessibility**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `intensity.reducedMotion` | Reduced-motion scale | `0.2` | 0 – 1 | ratio | Applied to shake, flash and motion when the host requests reduced motion. |
| `safety.maxFlashHz` | Max flashes per second | `3` | 0 – 3 | Hz | Strobing is capped to this rate (WCAG general-flash threshold is 3). |
| `safety.maxFlashAlpha` | Max flash opacity | `85` | 0 – 100 | % | Hard ceiling on full-screen flash opacity. |

### Board (7)

Cell gap, padding and frame. The board layout derives its cell size from these and the viewport.

**Layout**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `board.gap` | Cell gap | `6` | 0 – 40 | % cell | Space between cells. |
| `board.padding` | Board padding | `30` | 0 – 100 | % cell | Space between cells and the frame. |

**Cells & frame**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `board.cellRadius` | Cell radius | `18` | 0 – 50 | % cell | Rounded corners of each cell. |
| `board.cellFill` | Cell fill | → `color.surfaceAlt` | hex colour or colour role |  | Cell background. |
| `board.cellFillOpacity` | Cell fill opacity | `70` | 0 – 100 | % | Cell background opacity. |
| `board.frameWidth` | Frame width | `8` | 0 – 30 | % cell | Board frame stroke. |
| `board.frameColor` | Frame colour | → `color.primary` | hex colour or colour role |  | Board frame colour. |

### Layers (35)

Draw order, opacity, blend and camera-follow for each render layer.

Layers (bottom to top by default): `backdrop`, `board`, `fxBelow`, `symbols`, `fxAbove`, `overlay`, `ui`. Each has `visible`, `opacity`, `blend`, `z` and `followsCamera`:

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `layer.backdrop.visible` | Visible | `true` | on / off |  | Hide the layer in this theme. |
| `layer.backdrop.opacity` | Opacity | `100` | 0 – 100 | % | Layer opacity. |
| `layer.backdrop.blend` | Blend | `source-over` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for the layer. |
| `layer.backdrop.z` | Order | `10` | 0 – 100 |  | Draw order; lower draws first. |
| `layer.backdrop.followsCamera` | Follows camera | `false` | on / off |  | Whether screen shake moves this layer. |

### Effect assets (3)

Images effects may use. Empty means the procedural fallback is used.

**Images**

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `asset.backdrop` | Backdrop image | _empty_ | image asset id |  | Stretched to the viewport on the backdrop layer. |
| `asset.particle` | Particle sprite | _empty_ | image asset id |  | Sprite for coin bursts whose shape is "sprite". |
| `asset.bannerPlate` | Banner plate | _empty_ | image asset id |  | Image used instead of the generated plate on win banners. |

### Sound cues (64)

Map semantic cues to audio assets, gain and pitch. Markers on effects and sequences trigger these.

16 cues × 4 tokens (`cue.<id>.enabled`, `.asset`, `.gain` dB, `.pitch` semitones):

| Cue | Description |
|---|---|
| `win.small` | Short sting for a regular win highlight. |
| `win.big` | Big win banner arrival. |
| `win.mega` | Mega/epic win hit. |
| `coin.burst` | Coins leaving the emitter. |
| `coin.land` | Coins settling / tail of a burst. |
| `cascade.pop` | Winning symbols popping out. |
| `cascade.land` | New symbols landing. |
| `anticipation.rise` | Tension build while a feature is possible. |
| `multiplier.hit` | Multiplier badge landing. |
| `shake.impact` | Low thump that pairs with screen shake. |
| `whoosh` | Shockwave / sweep. |
| `shine.sparkle` | Light sweep glint. |
| `line.draw` | Win line tracing across the board. |
| `counter.tick` | Win counter step. |
| `counter.end` | Win counter finished. |
| `callout.hit` | Text callout (free spins, etc.) arrival. |

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `cue.win.small.enabled` | Enabled | `true` | on / off |  | Mute or unmute the "win.small" cue for this theme. |
| `cue.win.small.asset` | Audio asset | _empty_ | audio asset id |  | Audio file for this cue. Empty uses the preview synth blip (the host supplies real audio). |
| `cue.win.small.gain` | Gain | `0` | -40 – 6 | dB | Level of this cue. |
| `cue.win.small.pitch` | Pitch | `0` | -12 – 12 | st | Pitch shift. |

## Effects (12)

Layers 2–4 of the chain: a theme can set defaults for any parameter below, a preset can override them, and a sequence clip can override them again for one instance.

### Symbol highlight (`symbolHighlight`)

Pulsing outline, glow and fill on winning cells; other cells can be dimmed.

Intensity family: `glow` · default layer: `fxAbove` · default cue markers: `win.small`@0 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `1400` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `opacity` | Opacity | `100` | 0 – 100 | % | Overall effect opacity. |
| `layer` | Layer | `fxAbove` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `source-over` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `target` | Target cells | `winCells` | `winCells` · `allCells` |  | Which cells are highlighted. |
| `style` | Style | `both` | `outline` · `fill` · `both` |  | What is drawn on each cell. |
| `color` | Colour | → `color.win` | hex colour or colour role |  | Highlight colour (defaults to the "win" role). |
| `outlineWidth` | Outline width | → `outline.width` | 0 – 30 | % cell | Stroke width. Defaults to the theme outline width. _(only when `style` is `outline` / `both`)_ |
| `glowBlur` | Glow blur | → `outline.glowBlur` | 0 – 60 | % cell | Glow radius. Scales with intensity. |
| `glowStrength` | Glow strength | → `outline.glowStrength` | 0 – 100 | % | Glow opacity. Scales with intensity. |
| `fillAlpha` | Fill opacity | `28` | 0 – 100 | % | Fill strength at the pulse peak. _(only when `style` is `fill` / `both`)_ |
| `cornerRadius` | Corner radius | → `board.cellRadius` | 0 – 50 | % cell | Highlight corner radius. |
| `dimOthers` | Dim other cells | `35` | 0 – 90 | % | Darkens non-target cells while the highlight plays. |
| `pulses` | Pulses | `3` | 1 – 8 | count | Number of pulses over the duration. |
| `pulseScale` | Pulse scale | `1.1` | 1 – 1.6 | × | Peak scale of each pulse (also pops the symbol itself). |
| `cellStagger` | Cell stagger | `60` | 0 – 400 | ms | Delay between consecutive cells. Scaled by the theme stagger scale. |

### Win line (`winLine`)

A glowing line that traces through the winning cells in order.

Intensity family: `glow` · default layer: `fxAbove` · default cue markers: `line.draw`@0 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `1200` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `easing` | Easing | `easeInOutCubic` | `theme` · `linear` · `easeOutQuad` · `easeOutCubic` · `easeInOutCubic` · `easeOutBack` · `easeOutElastic` · `easeOutBounce` · `spring` |  | Progress curve. "Theme" follows the motion personality. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `opacity` | Opacity | `100` | 0 – 100 | % | Overall effect opacity. |
| `layer` | Layer | `fxAbove` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `source-over` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `color` | Colour | → `color.accent` | hex colour or colour role |  | Line colour. |
| `lineWidth` | Line width | `14` | 2 – 40 | % cell | Core line thickness. |
| `glowBlur` | Glow blur | → `outline.glowBlur` | 0 – 60 | % cell | Glow radius. Scales with intensity. |
| `nodes` | Show nodes | `true` | on / off |  | Draw a dot on every cell the line passes through. |
| `nodeSize` | Node size | `22` | 4 – 60 | % cell | Node dot diameter. _(only when `nodes` is `true`)_ |
| `drawFraction` | Draw time | `55` | 5 – 100 | % | Share of the duration spent tracing; the rest holds then fades. |
| `fade` | Fade out | `20` | 0 – 60 | % | Share of the duration used to fade out at the end. |

### Coin burst (`coinBurst`)

Physics-driven particle burst: coins, confetti, stars or sparks.

Intensity family: `particles` · default layer: `fxAbove` · default cue markers: `coin.burst`@0 ms, `coin.land`@1100 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `1800` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `seed` | Random seed | `1` | 0 – 99999 |  | Seed for scatter/jitter. Same seed gives an identical result. |
| `opacity` | Opacity | `100` | 0 – 100 | % | Overall effect opacity. |
| `layer` | Layer | `fxAbove` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `source-over` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `origin` | Origin | `centre` | `centre` · `winCells` · `topCentre` |  | Where particles are emitted. |
| `count` | Particle count | `60` | 1 – 400 | count | Number of particles. Scales with intensity. |
| `burstWindow` | Emit window | `8` | 0 – 60 | % | Share of the duration over which particles spawn (0 = all at once). |
| `shape` | Shape | `coin` | `coin` · `confetti` · `star` · `spark` · `sprite` |  | Particle shape. "Sprite" uses the theme's particle image, falling back to coins. |
| `sizeMin` | Size min | `14` | 4 – 100 | % cell | Smallest particle. |
| `sizeMax` | Size max | `28` | 4 – 150 | % cell | Largest particle. |
| `colorA` | Colour A | → `color.accent` | hex colour or colour role |  | Primary particle colour. |
| `colorB` | Colour B | → `color.primary` | hex colour or colour role |  | Secondary colour for confetti, stars and sparks. _(only when `shape` is `confetti` / `star` / `spark`)_ |
| `colorC` | Colour C | → `color.secondary` | hex colour or colour role |  | Third confetti colour. _(only when `shape` is `confetti`)_ |
| `glowBlur` | Glow blur | `0` | 0 – 60 | % cell | Optional glow around each particle. |
| `speed` | Launch speed | `900` | 100 – 3000 | % cell/s | Mean launch speed. Scales gently with intensity. |
| `spread` | Spread | `360` | 0 – 360 | ° | Cone width of the burst. |
| `direction` | Direction | `-90` | -180 – 180 | ° | Cone centre (−90° is up). |
| `gravity` | Gravity | `2200` | 0 – 6000 | % cell/s² | Downward acceleration. |
| `drag` | Air drag | `0.6` | 0 – 5 | ratio | Velocity decay per second. |
| `spin` | Spin | `360` | 0 – 1440 | °/s | Maximum rotation speed. |
| `lifetimeSpread` | Lifetime variance | `30` | 0 – 80 | % | How much particle lifetimes vary. |
| `fade` | Fade out | `40` | 0 – 100 | % | Share of a particle's life spent fading. |

### Big win banner (`bigWinBanner`)

Win plate with burst rays, a tier title and a counting win amount.

Intensity family: `text` · default layer: `ui` · default cue markers: `win.big`@0 ms, `counter.tick`@400 ms, `counter.end`@2300 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `3200` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `easing` | Easing | `theme` | `theme` · `linear` · `easeOutQuad` · `easeOutCubic` · `easeInOutCubic` · `easeOutBack` · `easeOutElastic` · `easeOutBounce` · `spring` |  | Progress curve. "Theme" follows the motion personality. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `opacity` | Opacity | `100` | 0 – 100 | % | Overall effect opacity. |
| `layer` | Layer | `ui` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `source-over` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `tier` | Win tier | `big` | `big` · `mega` · `epic` |  | Selects the title and the theme's per-tier intensity multiplier. |
| `title` | Title override | _empty_ | ≤ 24 chars |  | Replaces the tier title when not empty. |
| `showCounter` | Show counter | `true` | on / off |  | Count the win amount up beneath the title. |
| `counterFraction` | Count time | `70` | 10 – 100 | % | Share of the duration spent counting up. _(only when `showCounter` is `true`)_ |
| `decimals` | Decimals | `2` | 0 – 4 | count | Decimal places in the counter. _(only when `showCounter` is `true`)_ |
| `prefix` | Currency prefix | _empty_ | ≤ 6 chars |  | Text placed before the amount (e.g. a currency symbol). _(only when `showCounter` is `true`)_ |
| `plateWidth` | Plate width | `560` | 100 – 1400 | % cell | Plate width. |
| `plateHeight` | Plate height | `300` | 60 – 800 | % cell | Plate height. |
| `tilt` | Tilt | `-3` | -15 – 15 | ° | Plate rotation. |
| `titleColor` | Title colour | → `color.win` | hex colour or colour role |  | Title fill (lightened toward the top). |
| `counterColor` | Counter colour | → `color.text` | hex colour or colour role |  | Counter fill. _(only when `showCounter` is `true`)_ |
| `rays` | Burst rays | `true` | on / off |  | Rotating comic-book rays behind the plate. |
| `rayCount` | Ray count | `18` | 4 – 48 | count | Number of rays. _(only when `rays` is `true`)_ |
| `rayColor` | Ray colour | → `color.accent` | hex colour or colour role |  | Ray colour. _(only when `rays` is `true`)_ |
| `rayAlpha` | Ray opacity | `35` | 0 – 100 | % | Ray opacity at the centre. Scales with intensity. _(only when `rays` is `true`)_ |
| `raySpeed` | Ray rotation | `24` | 0 – 180 | °/s | Ray rotation speed. _(only when `rays` is `true`)_ |

### Screen shake (`screenShake`)

Camera shake with decay, optional roll and zoom punch. Moves every layer that follows the camera.

Intensity family: `shake` · default layer: none (acts on the camera / cells) · default cue markers: `shake.impact`@0 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `600` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `seed` | Random seed | `1` | 0 – 99999 |  | Seed for scatter/jitter. Same seed gives an identical result. |
| `amplitude` | Amplitude | `8` | 0 – 60 | % cell | Peak displacement as a percentage of a cell. Scales with intensity. |
| `frequency` | Frequency | `18` | 1 – 40 | Hz | Shake oscillations per second. |
| `decay` | Decay | `1.6` | 0.2 – 4 | ratio | How quickly the shake dies away (higher = faster). |
| `axis` | Axis | `both` | `both` · `x` · `y` |  | Which axes move. |
| `rotation` | Roll | `0.6` | 0 – 6 | ° | Peak camera roll. |
| `zoomPunch` | Zoom punch | `1.5` | 0 – 10 | % | Impact zoom that relaxes over the duration. |

### Screen flash (`flash`)

Full-screen flash with attack/decay. Strobing is capped by the theme's photosensitivity limits.

Intensity family: `flash` · default layer: `overlay` · default cue markers: none

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `500` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `layer` | Layer | `overlay` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `screen` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `color` | Colour | → `color.text` | hex colour or colour role |  | Flash colour. |
| `shape` | Shape | `radial` | `full` · `radial` |  | Even fill or a burst centred on the board. |
| `peak` | Peak opacity | `60` | 0 – 100 | % | Opacity at the brightest point. Clamped by safety.maxFlashAlpha. |
| `attack` | Attack | `10` | 0 – 90 | % | Share of each strobe spent rising. |
| `strobes` | Strobes | `1` | 1 – 8 | count | Flashes in the duration. Limited by safety.maxFlashHz. |

### Shockwave (`shockwave`)

One or more expanding glowing rings.

Intensity family: `glow` · default layer: `fxAbove` · default cue markers: `whoosh`@0 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `900` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `easing` | Easing | `easeOutCubic` | `theme` · `linear` · `easeOutQuad` · `easeOutCubic` · `easeInOutCubic` · `easeOutBack` · `easeOutElastic` · `easeOutBounce` · `spring` |  | Progress curve. "Theme" follows the motion personality. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `opacity` | Opacity | `100` | 0 – 100 | % | Overall effect opacity. |
| `layer` | Layer | `fxAbove` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `lighter` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `origin` | Origin | `centre` | `centre` · `winCells` |  | Where rings expand from. |
| `rings` | Rings | `2` | 1 – 6 | count | Rings per origin. |
| `ringStagger` | Ring stagger | `120` | 0 – 600 | ms | Delay between rings. Scaled by the theme stagger scale. |
| `color` | Colour | → `color.secondary` | hex colour or colour role |  | Ring colour. |
| `width` | Ring width | `12` | 1 – 60 | % cell | Stroke width at the start. |
| `thinning` | Thinning | `0.8` | 0 – 1 | ratio | How much the ring thins as it expands (1 = vanishes). |
| `glowBlur` | Glow blur | → `outline.glowBlur` | 0 – 60 | % cell | Glow radius. |
| `startRadius` | Start radius | `20` | 0 – 300 | % cell | Radius at t = 0. |
| `endRadius` | End radius | `700` | 50 – 1500 | % cell | Radius at the end. Scales with intensity. |

### Cascade drop (`cascadeDrop`)

Winning symbols pop out, then replacement symbols drop in from above.

Intensity family: `motion` · default layer: none (acts on the camera / cells) · default cue markers: `cascade.pop`@0 ms, `cascade.land`@450 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `1000` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `easing` | Easing | `theme` | `theme` · `linear` · `easeOutQuad` · `easeOutCubic` · `easeInOutCubic` · `easeOutBack` · `easeOutElastic` · `easeOutBounce` · `spring` |  | Progress curve. "Theme" follows the motion personality. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `seed` | Random seed | `1` | 0 – 99999 |  | Seed for scatter/jitter. Same seed gives an identical result. |
| `target` | Target cells | `winCells` | `winCells` · `allCells` |  | Which cells cascade. |
| `popFraction` | Pop share | `35` | 10 – 80 | % | Share of each cell's time spent popping out before the drop. |
| `popScale` | Pop swell | `1.2` | 1 – 2 | × | Swell before the symbol vanishes. Scales with intensity. |
| `fallDistance` | Fall distance | `320` | 100 – 1500 | % cell | How far above its slot the new symbol starts. |
| `spin` | Spin | `14` | 0 – 90 | ° | Rotation while popping. Scales with intensity. |
| `columnStagger` | Column stagger | `60` | 0 – 300 | ms | Delay between columns. Scaled by the theme stagger scale. |
| `rowStagger` | Row stagger | `35` | 0 – 200 | ms | Delay between rows, bottom first. Scaled by the theme stagger scale. |

### Multiplier pop (`multiplierPop`)

A badge showing ×N that pops in with a spin and a ring of sparks.

Intensity family: `text` · default layer: `fxAbove` · default cue markers: `multiplier.hit`@120 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `1100` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `easing` | Easing | `theme` | `theme` · `linear` · `easeOutQuad` · `easeOutCubic` · `easeInOutCubic` · `easeOutBack` · `easeOutElastic` · `easeOutBounce` · `spring` |  | Progress curve. "Theme" follows the motion personality. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `opacity` | Opacity | `100` | 0 – 100 | % | Overall effect opacity. |
| `layer` | Layer | `fxAbove` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `source-over` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `value` | Value | `3` | 2 – 1000 | count | Multiplier shown on the badge. |
| `prefix` | Prefix | `×` | ≤ 3 chars |  | Text before the value. |
| `target` | Position | `centre` | `centre` · `lastWin` |  | Where the badge lands. |
| `shape` | Shape | `burst` | `burst` · `circle` · `rounded` |  | Badge outline. |
| `size` | Size | `130` | 40 – 400 | % cell | Badge diameter. |
| `color` | Badge colour | → `color.primary` | hex colour or colour role |  | Badge fill. |
| `textColor` | Text colour | → `color.text` | hex colour or colour role |  | Value colour. |
| `trail` | Spark ring | `true` | on / off |  | Ring of sparks that expands as the badge lands. |
| `spin` | Spin | `180` | 0 – 720 | ° | Rotation that unwinds as the badge pops in. |
| `hold` | Hold | `45` | 10 – 90 | % | How long the badge stays fully visible before fading. |

### Anticipation glow (`anticipationGlow`)

Pulsing frame glow (and optional vignette) that builds tension.

Intensity family: `glow` · default layer: `fxBelow` · default cue markers: `anticipation.rise`@0 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `1600` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `easing` | Easing | `linear` | `theme` · `linear` · `easeOutQuad` · `easeOutCubic` · `easeInOutCubic` · `easeOutBack` · `easeOutElastic` · `easeOutBounce` · `spring` |  | Progress curve. "Theme" follows the motion personality. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `opacity` | Opacity | `100` | 0 – 100 | % | Overall effect opacity. |
| `layer` | Layer | `fxBelow` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `lighter` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `target` | Target | `frame` | `frame` · `winCells` |  | What glows. |
| `color` | Colour | → `color.accent` | hex colour or colour role |  | Glow colour. |
| `width` | Stroke width | `10` | 2 – 40 | % cell | Glow stroke thickness. |
| `glowBlur` | Glow blur | → `outline.glowBlur` | 0 – 60 | % cell | Glow radius. |
| `minAlpha` | Minimum opacity | `15` | 0 – 100 | % | Opacity at the pulse trough. |
| `maxAlpha` | Maximum opacity | `80` | 0 – 100 | % | Opacity at the pulse peak. Scales with intensity. |
| `vignette` | Vignette | `30` | 0 – 80 | % | Edge darkening to focus the board. |
| `rate` | Pulse rate | `2.2` | 0.5 – 6 | Hz | Pulses per second. |
| `buildUp` | Build-up | `60` | 0 – 100 | % | How much the amplitude grows from start to end. |

### Shine sweep (`shine`)

A diagonal band of light sweeping across cells or the whole board.

Intensity family: `glow` · default layer: `fxAbove` · default cue markers: `shine.sparkle`@0 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `900` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `easing` | Easing | `easeInOutCubic` | `theme` · `linear` · `easeOutQuad` · `easeOutCubic` · `easeInOutCubic` · `easeOutBack` · `easeOutElastic` · `easeOutBounce` · `spring` |  | Progress curve. "Theme" follows the motion personality. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `opacity` | Opacity | `100` | 0 – 100 | % | Overall effect opacity. |
| `layer` | Layer | `fxAbove` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `lighter` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `target` | Target | `winCells` | `winCells` · `board` |  | Where the sweep runs. |
| `color` | Colour | → `color.text` | hex colour or colour role |  | Band colour. |
| `angle` | Angle | `20` | -60 – 60 | ° | Tilt of the band. |
| `bandWidth` | Band width | `60` | 10 – 300 | % cell | Band thickness. |
| `peak` | Peak brightness | `55` | 0 – 100 | % | Band opacity at its centre. Scales with intensity. |
| `sweeps` | Sweeps | `1` | 1 – 4 | count | Number of passes. |
| `cellStagger` | Cell stagger | `50` | 0 – 400 | ms | Delay between consecutive cells. Scaled by the theme stagger scale. _(only when `target` is `winCells`)_ |

### Text callout (`textCallout`)

Generic themed message (FREE SPINS, +10, ROUND OVER) on an optional plate.

Intensity family: `text` · default layer: `ui` · default cue markers: `callout.hit`@0 ms

| Key | Label | Default | Bounds / options | Unit | Description |
|---|---|---|---|---|---|
| `duration` | Duration | `1400` | 100 – 12000 | ms | Base duration before the theme's duration scale is applied. |
| `easing` | Easing | `theme` | `theme` · `linear` · `easeOutQuad` · `easeOutCubic` · `easeInOutCubic` · `easeOutBack` · `easeOutElastic` · `easeOutBounce` · `spring` |  | Progress curve. "Theme" follows the motion personality. |
| `intensity` | Intensity | `1` | 0 – 3 | ratio | Effect-level multiplier on top of the theme's family intensity. |
| `opacity` | Opacity | `100` | 0 – 100 | % | Overall effect opacity. |
| `layer` | Layer | `ui` | `backdrop` · `board` · `fxBelow` · `symbols` · `fxAbove` · `overlay` · `ui` |  | Render layer this effect draws into. |
| `blend` | Blend | `source-over` | `source-over` · `lighter` · `screen` · `multiply` · `overlay` |  | Composite mode for this effect's primitives. |
| `text` | Text | `FREE SPINS` | ≤ 40 chars |  | Message to show. |
| `role` | Type role | `display` | `display` · `headline` · `body` · `numeric` · `label` |  | Typography role from the theme. |
| `sizeMul` | Size multiplier | `1` | 0.3 – 3 | × | Scales the role's size. |
| `color` | Text colour | → `color.text` | hex colour or colour role |  | Text fill. |
| `plate` | Plate | `true` | on / off |  | Draw a themed plate behind the text. |
| `tilt` | Tilt | `0` | -20 – 20 | ° | Rotation. |
| `anchor` | Anchor | `centre` | `centre` · `top` · `bottom` |  | Where the callout sits relative to the board. |
| `rise` | Rise | `30` | 0 – 200 | % cell | Upward drift over the duration. |
| `scaleFrom` | Start scale | `0.6` | 0.2 – 2 | ratio | Scale at the start of the pop-in. |
| `hold` | Hold | `50` | 0 – 90 | % | Share of the duration the callout stays fully visible after popping in. |

