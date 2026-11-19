import { CELEBRATIONS } from './celebrate';
import { DESTROYERS } from './destroy';
import { DISTORTIONS } from './distort';
import { BOARD_FX } from './boardfx';
import { BOARD_MODS } from './boardmods';
import { AMBIENT_FX } from './ambient';
import { CINEMA_FX } from './cinema';
import { SPIN_FX } from './spinfx';
import { SYMBOL_FX } from './symbolfx';
import { LANE_FX } from './lanefx';
import { CASCADE_FX } from './cascadefx';
import { SCREEN_FX } from './screenfx';
import { FRAME_FX } from './frames';
import { EMITTERS } from './emit';
import { EXPLOSIONS } from './explosions';
import { EXPLOSIONS2 } from './explosions2';
import type { ShowEffect } from './effect';
import { flash } from './flash';
import { fragment } from './fragment';
import { IMPACTS } from './impact';
import { LIGHTS } from './light';
import { particles } from './particles';
import { plasma, plasmaV1 } from './plasma';
import { shake } from './shake';
import { shockwave } from './shockwave';
import { smoke } from './smoke';
import { sound } from './sound';
import { vortex } from './vortex';
import { TEXT_FX } from './textfx';
import { TRANSITIONS } from './transitions';
import { XFORMS } from './xform';

/**
 * Every effect, by id. `shockwave` and `vortex` are the approved looks and must never change; `plasma-v1` is archived and kept only
 * so frozen presets stay reproducible; `smoke` is experimental and is only offered under Experimental.
 */
export const EFFECTS: ShowEffect[] = [
  shockwave, vortex, plasma, fragment, flash, shake, particles, sound, smoke, plasmaV1,
  ...DISTORTIONS, ...LIGHTS, ...DESTROYERS, ...EXPLOSIONS, ...EXPLOSIONS2, ...TRANSITIONS, ...TEXT_FX, ...EMITTERS, ...BOARD_FX, ...BOARD_MODS, ...AMBIENT_FX, ...FRAME_FX, ...CINEMA_FX, ...SPIN_FX, ...SYMBOL_FX, ...LANE_FX, ...CASCADE_FX, ...SCREEN_FX, ...XFORMS, ...IMPACTS, ...CELEBRATIONS,
];
export const effectById = (id: string): ShowEffect | undefined => EFFECTS.find((e) => e.id === id);
export { flash, fragment, particles, plasma, plasmaV1, shake, shockwave, smoke, sound, vortex };
