# BANGERS VFX Playground

A library of polished, customisable effects for slot-style games, built to be **customised, saved and referenced precisely** when developing games with an AI assistant. Everything the playground shows is produced by the same runtime that the exported bundles ship: there are no editor-only visual tricks.

```bash
npm run vfx                      # builds and opens the one-file playground (easiest; no server)
npm run playground               # dev server (http://127.0.0.1:5174/playground.html)
npm run build:playground         # dist/playground/  (fonts stay separate files and load lazily)
npm run build:playground-single  # dist/playground-single/index.html: ONE self-contained file (opens straight from disk)
npm run playground:e2e           # build + the full Playwright verification suite (headless Chromium, software WebGL2)
npm test                         # unit tests, including fonts, gradients, style stack, motion, effects, library, colour ramp
```

## The workflow

**Category → effect → enter text / upload images → adjust → preview → save / export.**

1. Pick one of the ten categories (or search every effect; star favourites). Every card is the real effect playing.
2. Open an effect. **Content** holds what you change: text (several lines), amounts, pictures.
3. **Look** is typography and styling, **Motion** the animation containers, **Effects** the effect layers; advanced controls are collapsed.
4. **Save & export**: *Save as my preset*, *Copy for AI Coding*, JSON, or a portable bundle (zip).

Built-in presets never change: opening one gives you a working copy. Saving creates **your** preset with its own stable id (`user.<name>`) and a version that grows with every save (`user.my-win@2`); older versions stay available. Exports always carry a stable id and version, so an unsaved copy is saved first.

## The ten categories (620 presets)

| Category | Presets | What is in it |
|---|---|---|
| Text animations | 61 | per-letter / word / line entrances, idles, emphasis and exits (133 motions in all), under headings; 18 **calm and clean** ones for messages and titles |
| Text styling | 77 | slot classics (glossy green "BIG WIN", two-tone gold "MAX WIN", digits, pink titles, wild labels), metal, light and neon, elements and materials, the same looks in the closest fonts, and **effects on the letters** (burning, frozen, electric, glittering) |
| Amount counters | 22 | roll, flip, pop and slot-reel digits with fixed digit slots, prefix/suffix, separators |
| Messages and win celebrations | 52 | pop-out banners with a message background, several text lines, an amount and fanfare; five **win ladders** (the message switches tier: Big → Mega → Epic …); 13 **coin and gem fountains** with real physics; **particles from your own picture**; 7 **feature triggers** (letterbox, push-in, flash, slam) |
| Symbol pop and destruction | 54 | breaking apart, **fire and explosions, smoke and steam, burning away, sparks / confetti / gems, melting / freezing / dissolving**, and 18 **whole-tile** versions that take the frame along |
| Symbol transformation and expansion | 138 | morph, upgrade, expand across the reels, …; 8 **reel spins** (classic, drum, turbo, drop-in, pop-in …); 6 **special symbols** (scatter trigger, expanding wild, sticky wilds, bonus tiles, cascade); 32 **spin effects** (trails, sparks, fire, energy …); 33 **special symbol animations** (motions and auras for wilds, scatters and bonus tiles); 31 **whole row and whole reel effects**; 8 **expanding wilds with an animation of their own**; 13 **cascades** |
| Multipliers | 28 | x2…x100 badges that build, slam, orbit and charge |
| Impacts | 68 | shockwave, vortex (both approved and frozen), plasma, slam, lightning, burst, pound, …; **reel landings** (5); **board hits** (shake, zap: 6) and **board elements** (smoke, frozen: 9) that act on the slot grid only; **screen shakes** (13) and **screen impacts** (16: blast, cracked screen, thunder, storm light …); more **board shakes** (recoil, heartbeat, footsteps, sway, tilt) |
| Screen distortion | 37 | 11 ways to bend the picture (ripple, lens, heat, glitch, wave, zoom, chroma, pixelate, scanlines, shear) and **26 transitions between two screens** |
| Shine and highlights | 83 | sweeps, sparkles, glows, rays, flares (10); **win lines and spotlights** (7); **board glows** in twenty textures; **board themes** (Nordic, sci-fi, alien, Mexican, fire, cabaret, fishing, Egyptian, space, haunted, festival, candy, pirate, cyberpunk, Christmas, steampunk); **ambient loops** behind the reels (15); **animated frames** (15) |

Two older looks live under *Archived and experimental* so earlier work stays reproducible: Plasma v1 (the approved Plasma v2 has the clean ending) and Smoke (not approved; kept as experimental). The approved looks (Shockwave, Vortex, Plasma v2) are frozen and unchanged.

The engine has 146 effects and 133 motions; a preset is a scene (elements + effect layers) with named inputs. Inside a category, presets with a `group` are shown under headings.

### Symbol destruction: fire, smoke, particles and whole tiles

Sixteen effects were added to the destruction list, all drawn from real simulated pieces rather than sprites:

- **Fire and explosions**: fireball, bomb blast, chain reaction, flame burst, engulfed in flames, struck by lightning. Fire and smoke are volumetric (domain-warped noise, smoke lit by the fire next to it, black-body colour ramp), with a flash, a real shove through the picture (screen displacement), camera shake, debris cut from the symbol's own pixels, sparks and embers.
- **Smoke and steam**: vanish in smoke, smoke bomb, steam burst. **Burning away**: burn to ash, turn to embers. **Sparks, confetti and gems**: spark burst, confetti pop, gem burst. **Ice and acid**: freeze and shatter, acid melt.
- Every one has a **Fills** setting: *the icon only* (it follows the icon's pixels) or *the whole square* (it fills the symbol cell). Fire colour (orange, blue, green, violet, white-hot) and smoke colour (grey, black soot, white steam, toxic, cold mist, magic purple, dust) are settings.
- **Frames**: in the Effects tab, *Frame that goes with it* takes a second picture (a tile, bezel or card; *+ Symbol frame* in Content adds one) along with the symbol. The player composes both into one picture at their resting pose and the effect destroys the whole tile: the frame cracks, burns, freezes or is blown to pieces together with the symbol. Five square tile frames are built in; upload your own PNG or transparent WebM.

### Screen transitions

Screen distortion also holds 26 transitions in 18 kinds: **burn through** (fire, blue flame, a burning hole), **wall of fire**, **smoke cover** (grey, black soot, magic, steam), **ink bleed**, **freeze and shatter**, **glass break**, **laser scan**, **laser cut**, **shockwave wipe**, **portal**, **whirlpool**, **lightning flash**, **pixel dissolve**, **tile flip**, **blinds**, **glitch cut** and **zoom through**. A transition goes from one screen to another, so the playground shows two stand-in pictures (*First screen* and *Next screen*, never part of an export); the new screen stays up after the change.

In your game, pass the screen it leaves and the screen it leads to:

```js
const player = await createVfxPlayer(canvas, { preset, base: './' }, { backdrop: screenA, backdropTo: screenB });
player.setBackdropTo(otherScreen);   // change the second screen later
```

### Win presentation

- **Win ladders** (Messages): the message *switches tier* as the win grows (BIG WIN → MEGA WIN → EPIC WIN …): each plate leaves as the next arrives, the rays, shake, coin fountain and counting speed escalate with the tier, and the amount keeps counting across the switch. Five ladders in different looks.
- **Coin and gem fountains** (`emit.fountain`, `emit.burst`, `emit.rain`, `emit.rise`): every piece is simulated (fixed 1/90 s steps): launch, gravity, spin, **bounce off a floor** that loses energy, and optionally **fly to the balance meter** you place (they arrive one after another, the last as the counter finishes). Pieces are vector coins, gems, stars, hearts, petals, leaves, bubbles, sparks … or **your own picture**: aim the effect at an uploaded PNG / transparent WebM and that picture is the particle.

### Reels (the slot grid)

A **reel board** is a scene element (*Content → + Reels*): 3–8 reels × 2–6 rows, symbols (built-in or your own PNG / WebM, each marked ordinary, wild, scatter or bonus), a picture behind every cell and one behind the board. Everything it does is a pure function of time, so scrubbing, replay and export are exact; the same plan (`planBoard`) drives the pictures, the effect cues and the cue points for your sounds.

- **Five spin animations**: classic (symbols scroll with vertical **motion blur**, stop one reel after another with a springy **stop bounce**), drum (a turning cylinder: symbols shrink and darken toward the edges), turbo (long streaks, hard stop), drop-in (symbols fall out and a new set drops in with bounces), pop-in (shrink away, elastic pop in), and *rest* (no spin: a board that is simply there, for backgrounds and frames).
- **What lands**: a line win (eight lines, the winners hop / pulse / shake / glow while the rest dims, with the win line drawn through them), scatters that trigger a feature (with **anticipation**: when two have landed, the last reels slow, burn and glow), an **expanding wild**, **sticky wilds** (glowing auras), **bonus tiles** that lock and are collected by light trails flying into a meter, and **cascades / tumbles** (winners pop, symbols fall into the gaps with a bounce, the new board wins again).
- **Effects aimed at a board** (*Effects → Works on this board*): landing impacts (ring, flash, sparks, a jolt), anticipation, win line, sticky glow, expanding wild, collect trails, tumble bursts, light streaks; and the **board-only** ones that act on the grid and leave the background alone: **shake** (jolt, rumble, quake), **zap** (arcs between cells or round the frame), **smoke** (six colours), **frozen** (frost, icicles, crystals; shatter, thaw or stay), **glow in ten textures** (neon tube, aura, embers, plasma, hologram, starlight, aurora, water caustics, pulse rings, chasing lights) and **themes** that dress the grid (Nordic runes and aurora, sci-fi hologram, alien bioluminescence, Mexican papel picado and marigolds, fire, cabaret marquee, fishing, Egyptian gold).

#### Effects while the reels spin

Sixteen `spin.*` effects follow how fast each reel is *really* turning (read from the board's plan), so nothing shows on a reel at rest, the effect builds as the reel speeds up, thins as it brakes and is gone when it stops: **speed streaks, light trails** behind the symbols, **sparks**, **fire** (real flame on the symbols), **electricity** (crackling down the reels and leaping between them), a **plasma** double helix, **smoke**, **glitter**, **digital rain**, **frost**, an **air rush**, **comets**, **rainbow trails**, **bubbles**, **neon rails** and a **rumble** of the whole board. Colours, strength and variation are settings. 32 presets combine them (fire, blue fire, purple storm, dragon spin, cosmic spin, turbo blast …); the quality tiers thin them like the other board effects.

#### Special symbols: motion and auras

`symbol.motion` moves the wilds, scatters or bonus tiles (or winners, or all symbols) once they have landed: pulse, heartbeat, hover, jelly wobble, sway, coin flip, ta-da, bounce, pendulum, shake, punch-in, neon flicker and a breath of light. `symbol.aura` dresses them: wreath of flames, crawling electricity, turning rays, orbiting sparkles, pulsing rings, a sweeping shine, smoke, frost, plasma, a rune circle, embers or twinkling glints. Both choose *which symbols* and *when it starts* (on landing, with the win, at the start) and are applied to the symbol in its cell through a per-cell modifier of the board (`cellMod`), so the picture of the symbol itself moves. 33 presets (burning wild, storm scatter, holy scatter, frozen scatter, magic bonus tile …).

#### A whole row or a whole reel

`lane.run` sweeps one element along a **row or a reel**, either way, one lane or **every lane in turn**: **fire, electric arcs, a lightning bolt, a laser, plasma, ice, a beam of light, smoke, glitter, a wave of water, wind, a rainbow, shockwaves, magic runes** or a **blade slash**. It starts with the layer, the win, the last reel stopping, the first special symbol landing or the wild expanding, and the symbols in the lane **glow, jump, shake or fade** as the front passes. 31 presets (fire through every row, electricity through every reel, a cross of fire, a lightning grid, fire and ice …).

#### An expanding wild with an animation of its own

In *Content → the board → Symbols*, a wild has **While it expands** with a list of built-in animations (pillars of fire, lightning, golden light and a plasma helix) and **Upload WebM…** for your own transparent WebM (or a still). The animation plays from the moment the expansion starts and its last frame stays over the reel. *Fit*: it **grows** with the wild from one cell to the whole reel, or **covers the whole reel** from its first frame (a picture made for the full reel keeps its proportions). *Play*: at its **own speed** (the board's *Expansion time* is set to its length) or **fitted** to the expansion time. The ordinary symbols of that reel step back while it plays. It goes into JSON and bundle exports like any other WebM. The built-in ones are rendered from the playground's own effects by `node tools/playground/make-expansions.mjs`.

### Cascades

`cascade.burst` makes a tumble look finished: the winning cells **glow** from the moment of the win until they pop, then **burst** in a style you pick (light, glass shards, gems, fire pops, ice shatter, coins, sparkle or smoke), and every symbol that falls into the gaps lands with a soft **thud** of the board. It reads the board's own `win`, `pop` and `drop` events, so it follows however many tumbles the board plays. The 13 cascade presets add a **multiplier medallion** that climbs with each win and a **running win** that counts up to the figure won so far, each timed to the board's win events (so they stay right when you change the number of tumbles).

### Reference looks: lettering, plates, amounts and multipliers

- **Lettering** (Text styling → *Fantasy gold, steel, metal and carved digits*): ornate fantasy gold with a hard horizon, a heavy bevel and a thin dark line (and platinum, ruby, emerald, sapphire), ornate lining figures, **carved gold / silver / jade digits** (a deep bevel lit from above, a dark recess line inside a thin edge), **slime graffiti**, **steel badge** lettering (plain, red edge, gold edge), **pink / ice / sun metal** in square-cut capitals and **slab** capitals (white, yellow, ice) with a heavy black slab. The glow on these is deliberately small, so the letters stay crisp on a dark plate.
- **Shapes**: *shield* (heater shield with raised shoulders), *slab* (cut corners and a slant) and *pennant* (a hanging banner).
- **Plates** (Messages → *Plates like the references*): MAX WIN on **crimson, platinum or emerald crests** (two hanging pennants either side of the ornate lettering, a jewel above and an amount in gold figures counting up below); BIG WIN on a **steel shield** (steel, red or gold edge) with the two words stacked and the amount under it; MEGA WIN on a **violet, ice or sun plate** with metal lettering and confetti; NICE WIN on a **striped slab** in green, blue or amber.
- **Classic amounts** (Counters → *Classic amounts*): carved gold / silver / jade, ornate with a label, **euro** (€ first, full stops between thousands, comma before the cents), dollar, pound, whole-number credits, currency code after the figure, a gold-framed **win window**, a striped slab, a quiet **balance** readout and a **+ amount** that lifts away.
- **Multipliers** (Multipliers → *Medallions, jewels and shields*, *Builds and steps*): scalloped medallions in six metals, cut jewels (ruby, sapphire, emerald, amethyst), small steel shields, striped slabs, a climb from x2 to x10 inside a medallion, a double-up, *multiply the win* (an amount counts up to its multiplied figure under a slamming x5), a slab ladder and a rise-away confirmation.
- **Burning letters** (Text styling → *Effects on the letters*; effect `text.fire`): the flames grow out of the real top contour of every letter (the player hands effects the letters' own edge, so they follow the font, not a box) in four overlapping ranks that merge into one turbulent fire, with tall licks shooting up now and then. The letters get a hot rim and glow unevenly like heated metal; dark smoke leaves the flame tips in plumes, embers streak up and cool from white to red, and the air above shimmers. Orange, blue, green, violet and white-hot fires; controls: Flames, Smoke, Embers, Heat shimmer, Strength.
- **Calm text animations** (Text animations → *Calm and clean: for messages and titles*): drift and fade, tracking in, soft scale, focus in, letter reveal, settle, light up, unfold, alternating slides, a title with a subtitle, word by word and line by line. Nothing overshoots, spins or shakes; their motions (`drift-fade`, `tracking-in`, `soft-scale`, `focus-in`, `letter-reveal`, `settle-drop`, `alternate-slide`, `light-up`, `unfold-down`, their exits, `nudge`, `glint-pass`, `settle-bob`, `slow-glow` and `drift`) are in the Motion lists like any other.
- **Screen impacts** (Impacts → *Screen shakes*, *Screen impacts*): `impact.thud` (a heavy, quiet drop), `impact.recoil`, `impact.stomp` (footsteps that get closer, with dust), `impact.blast` (flash, fireball, a real shove through the picture, smoke and sparks, in five fire colours), `impact.crack` (the glass cracks from the point of impact and the fractures stay for a moment), `impact.thunder`, `impact.storm` (dark cloud lit from inside by flashes of **red** lightning, or any colour you choose), `impact.heartbeat` and `impact.wave`. Every one moves the camera in a way that always covers the frame. The plain *Screen shake* can now run for up to six seconds. The board gets five more shake kinds (recoil, heartbeat, footsteps, sway, tilt).

### Atmosphere

- **Ambient loops** (`ambient.*`): embers, snow, fireflies, god rays, bokeh and dust, twinkling stars with shooting stars. They are drawn **behind** the reels and text (or in front, or the nearest pieces in front: *Drawn*) and every movement uses whole numbers of cycles of the *Loop length*, so the last frame is the frame before the first. A scene flagged **Seamless loop** (*Effects tab*) restarts at once with no rest on the last frame, in the playground and in the bundle player.
- **Animated frames** (`frame.*`): chasing marquee bulbs (run, alternate, wave, twinkle, fill), a neon tube (steady, buzz, breathing, a failing sign, two colours chasing), a shimmer sweep, glints racing round the border, and a colour-cycling border. They go round the box of whatever they are aimed at: a reel board, a plate, a symbol, a word.
- **Feature-trigger cinematic** (`cinema.trigger`): letterbox bars, a slow push-in, and on the beat a flash, a burst of rays, rings and a punch of zoom, then everything eases back. The title is an ordinary text element whose *slam* entrance is timed to the beat.

### Making it yours

- **Your own sounds**: *Effects → Your own sounds*. Attach MP3 / WAV / OGG / M4A files (up to 8 MB and two minutes) to **cue points** the scene defines: the scene start and end, an element appearing, an effect's start, impact or end, and for a reel board each reel stopping, symbols landing, the win, the wild expanding, winners popping, symbols dropping in, each bonus tile collected. Each sound has an *earlier / later* offset and a volume; the built-in generated sounds can be kept or dropped. They play in the preview, ship in the bundle (`assets/`, hashed in the manifest) and the bundle player exposes `player.sounds()` (each with its time, volume and file) and `player.setSound(true)` to play them; the demo page has a *Sound* switch.
- **Quality tiers**: *Quality* beside the transport bar: **High**, **Medium**, **Low** (for weak phones) or **Automatic**. A tier scales the drawing buffer (100 / 80 / 60 %) and thins the particles every effect draws (100 / 65 / 35 %). Automatic starts from a guess about the device (phones and few cores start on medium) and watches real frame times: it steps down within about a second when frames run slow and back up only after six smooth seconds; a step up that does not hold is not tried again for a minute. In your game: `createVfxPlayer(canvas, src, { quality: 'auto' })` (the default; pass `'high'` for full quality always), `player.quality`, `player.setQuality('low')`.

## Fonts

142 distinct families (132 SIL OFL 1.1, 10 Apache 2.0), 208 font files, in ten categories: chunky, arcade, comic, condensed, rounded, fantasy, horror, sci-fi, western, elegant. **A family appears once however many weights it has**; weight and style are choices inside the family. Latin subset only (no Cyrillic, Greek, CJK or Arabic coverage). A character the font lacks is flagged with a visible warning on the stage (the browser draws that one character from its own fallback font); pick a font that has it.

- Licence, source URL, copyright and the date it was checked are recorded per family (`src/vfx/fonts/catalog.json`, generated by `npm run fonts:fetch`, which refuses any licence that is not on the allow-list) and shown in the browser and in exports.
- **Font browser**: metadata is available immediately; the list is virtualised; only the visible rows load their font (one file each, de-duplicated, cancelled when scrolled away, cached in Cache Storage); each row is drawn in its own face with your own text; category filters, search, favourites, weight and style, size, letter and line spacing. Title, amount, subtitle and multiplier each keep their own font.
- **Loading failures are visible**: the row and the stage show the error with *Retry*. A failed font is never replaced by a fallback font.
- **Your own font** (woff2/woff/ttf/otf): you must tick that you hold a licence ("you are responsible for the licence"); the file must parse as a font or it is rejected with a message. It is stored in this browser and travels with exports under your responsibility.
- Exports contain **only the fonts actually used**, each with its licence file, plus `font-licenses.json` and `FONT-LICENSES.txt` (family, source, licence id/url, files, weights, redistribution permitted, date checked). Nothing is loaded from the internet at run time.

## Gradients and styling

A gradient is solid, linear (any angle), radial, conic, reflected (metal) or animated. Stops can be added (double-click the bar), dragged, typed to an exact position, coloured, given opacity, duplicated, deleted, reversed and distributed evenly. Angle, centre X/Y, scale, radius, repeat, mirrored repeats, phase and animation (speed, direction, loop / back-and-forth / once) are all live. Presets: Gold, Chrome (reflected), Neon, Rainbow (animated), Fire, Ice, Alien plasma (animated); all editable afterwards.

A gradient can also carry a **wave**: a ripple along its boundary (the wavy split of the gold and green slot lettering).

Gradients apply **independently** to: the letter face, each of up to four outlines, the extrusion, the glow, frames and plates, amounts, multipliers, the colours of uploaded images (tint or replace; the picture's shape is the mask), and **effect layers** (an optional *colour ramp*: a gradient map that replaces the effect's colours by the ramp's colour at their brightness, animated if you like). Besides gradients the style stack has an inner highlight, a shallow bevel, 3D extrusion, drop shadow and glow. Colour and gradient edits never re-rasterise the letters.

Animation is layered and separate from styling: each element has entrance, idle, emphasis (several) and exit containers that stack, per block, line, word or letter.

## Pictures and video

Icons and message backgrounds can be **PNG** (or WebP/GIF) or **transparent WebM** (VP8/VP9 with alpha: Chromium and Firefox decode it, Safari does not). Video is decoded once into frames, keeps its alpha, loops or plays once, and ships in bundles as the original file. All destruction and transformation effects work on uploaded pictures.

## Exports

| Export | What it is |
|---|---|
| **Copy for AI Coding** | Markdown built from the *final* settings: preset id and version, fonts with licences, every number of the look and motion, every effect setting (defaults included), timing, the player call, and the exact preset JSON. |
| **Preset JSON** | `bangers.vfx-preset-file/1`: the preset (`bangers.vfx-preset/1`, scene `bangers.vfx-scene/1`), font licence manifest and embedded uploads. Import into any browser reproduces the same frames. |
| **Bundle (.zip)** | `bangers.vfx-bundle/1`: `preset.json`, `vfx-player.js` (no dependencies, WebGL2), `assets/`, **only the used fonts** with `LICENSE.txt`, `font-licenses.json`, `FONT-LICENSES.txt`, `manifest.json` (SHA-256 of every file), `README.md` (with the Copy-for-AI text) and a demo `index.html`. Works offline. |

Playing a bundle:

```js
import { createVfxPlayer } from './vfx-player.js';
const preset = await (await fetch('./preset.json')).json();
const player = await createVfxPlayer(canvas, { preset, base: './' });   // optional 3rd argument: { width, height, pixelRatio, loop, rest, backdrop, backdropTo, quality, sound }
player.play();  player.seek(1.2);  player.setText('title', 'MEGA WIN');  player.setCounter('amount', { to: 12345 });
player.onEnd(() => { /* finished */ });
player.sounds();            // your own sound files: [{ t, gain, name, asset, url }]
player.setSound(true);      // play them with the animation (call it from a click)
player.setQuality('auto');  // 'high' | 'medium' | 'low' | 'auto'
```

Screen distortions bend what is on the canvas; pass `backdrop: <canvas|image>` to bend your game as well. A transition needs `backdrop` (the screen it leaves) and `backdropTo` (the screen it leads to).

## Verification

What is checked automatically (all passing at the time of writing):

- **Unit tests** (`npm test`): font catalogue and licences, font service (dedupe, cancel, failure, custom), gradients (every control, including the wavy split), style stack, motion registry and rig, 146 effects (every one pure, finite and empty when finished; transitions start on the first screen, only move forward and end on the new one), screen pieces (glass and slabs tile the screen exactly), composed cells, library validity, groups and round-trips, colour ramp, **fountain physics and win ladders, the reel plan (spin timing, stop bounce, wins, scatters and anticipation, wilds, bonus tiles, cascades, assets), every board effect, ambient and frame loops (seamless, behind or in front), the cinematic (bars stay where they should under zoom), cue points and attached sounds (validation, offsets, missing cues), quality tiers and the automatic logic with simulated frame times**.
- **Playwright suite** (`npm run playground:e2e`, ~15 min on software rendering), `e2e/playground/`:
  - *library*: exactly ten categories; thumbnails animate; search and favourites; **every one of the 620 + 2 presets loads without errors, draws something and changes over time** (transitions between their two screens); no blank frame while switching presets; **a frame depends only on scene and time**.
  - *fonts*: ≥100 distinct licensed families; virtualised list; lazy, de-duplicated requests; every row in its real face; category filters, search, favourites, preview in your text; weight/style/size/spacing; simulated load failure with Retry and no fallback; custom upload with the licence statement and invalid files; independent fonts per element.
  - *variation*: headings in the library; a tile is destroyed together with its symbol and the choice is in the Effects tab; *+ Symbol frame*; the First and Next screens of a transition are chosen separately and change the first and last frame; all 26 transitions draw, change and end on the next screen.
  - *gradient*: every gradient control changes the canvas pixels (types, angle, centre, radius, scale, repeat, mirror, phase, stop colour/position/opacity/add/duplicate/delete/reverse/distribute/drag, animation speed/direction/loop); the seven presets are distinct; independent targets (face, outlines, extrusion, glow, image mask, effect ramp).
  - *export*: persistence across reload; built-ins never modified, versions, undo/redo; JSON export → fresh browser import gives **identical pixels**; the bundle verifies, ships only used fonts + licences, makes no outside request, and **plays pixel-identically to the playground at the same size**; Copy for AI follows every edit.
  - *uploads*: PNG and transparent WebM (alpha preserved, frames advance) into icon slots and message backgrounds; JSON/bundle/zip round trips with the media inside.
  - *reels*: the new library groups; editing a board as a person would (more reels, another picture, an upload, a role, another way of spinning, adding and removing symbols) and the picture follows; *+ Reels* on any effect and board effects aimed at it; board-only effects change the grid and not the background.
  - *expanding wild*: the built-in animations are drawn frame by frame over the reel and the stretched picture is gone; your own transparent WebM sets the expansion time, plays, can cover the reel or be fitted to the expansion time, and goes into the JSON and a bundle that plays identically.
  - *atmosphere*: ambient loops, frames and feature triggers under their headings; an ambient loop goes straight round again with no rest while an ordinary effect rests on its last frame; the last frame of a loop is the frame before the first (pixel difference no larger than an ordinary step); the seamless switch; the Effects menu groups.
  - *yours*: a WAV attached to the impact, moved to another cue with an offset, built-in sounds dropped, removed (and its file with it); a file that is not a sound and one that is too big are refused with a message; the preview and the ▶ button start audio; the exported bundle ships the file (hash matches), lists it in the manifest, verifies, and its player reports when the sound is due; quality tiers change the drawing-buffer size and the piece count, are remembered across a reload and show the tier automatic is using.
  - *single file*: one HTML file, no other request, real fonts from the embedded pack, bundle export, and `file://`.

## Limits (what is not claimed)

- Verified in headless Chromium with software WebGL2 (SwiftShader). Not tested on real GPUs, Safari, Firefox or phones; performance numbers on real hardware are unknown.
- Letters are rasterised at the preview's pixel scale and re-rasterised only when the size changes by more than 20 %, so a preview at another size is not pixel-identical to an export (an export is pixel-identical to a preview of the same size).
- The built-in sounds are a synthesiser used for the preview: exports list their cues (`player.cues()`) but do not ship them. Only sound files you attach yourself travel with an export.
- Quality tiers and automatic quality are verified for what they change (buffer size, piece counts, the tier logic with simulated frame times); how they feel on a real phone is unknown, and the automatic thresholds (26 ms to step down, 18.5 ms to step up) are a starting guess.
- Fonts are Latin only. Transparent WebM needs a browser that decodes alpha.
- Not integrated into any game; the bundles are the hand-off.
