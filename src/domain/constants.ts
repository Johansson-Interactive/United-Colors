import type { GameSettings } from "./types";

/**
 * Game constants ported from legacy GameRules.java.
 * All ratios are relative to screen density (applied at runtime).
 */

/** The pixel density the ratios are applied at as the game plays */
export const GAME_DENSITY = 400;

/** Game simulation runs at 30 Hz fixed step */
export const GAME_HERTZ = 30.0;

/** Small dot rules */
export const SMALL_DOT_SPEED_RATIO = 0.018;
export const SMALL_DOT_SIZE_RATIO = 0.0625;
/** Ticks between small dots at the start of a game (4 s: 15 a minute), and always in kiosk */
export const SMALL_DOT_CREATE_INTERVAL = 120;
/**
 * Difficulty ramp: small dots arrive this many more per minute with every minute played,
 * without limit (15 a minute at the start, 25 after a minute, 60 at 4:30). The rate rises in a
 * straight line rather than the interval falling in one: the legacy interval ran down to 0 at
 * 4:00, which held the rate nearly flat for two minutes and then sent it to infinity, so every
 * run ended by about 3:55 however well it was played. A steadily rising rate asks a steadily
 * rising number of catches a second of the player, so a better player lasts longer in step
 */
export const SMALL_DOT_RATE_GROWTH = 10;
/**
 * A small dot begins as a drip forming on a wall over the spawn wait, then shoots off it. A
 * drip never forms faster than this many ticks, so it still reads as a drop swelling; past
 * that point the walls drip from several places at once instead (see SpawnSystem)
 */
export const SMALL_DOT_MIN_GROW_TICKS = 6;
/** Ticks a launched drip is still tearing from its wall, rounding up as it lets go */
export const DRIP_LAUNCH_TICKS = 4;
/**
 * How far a drip's centre hangs from its wall, as a fraction of its radius: a bulge on the
 * wall at first, sagging past flush just before it tears off
 */
export const DRIP_HANG_MIN = 0.3;
export const DRIP_HANG_MAX = 1.1;
/**
 * How far a drip's centre sits along its wall from where it formed, toward the heading it
 * will shoot off on, as a fraction of its radius and of the heading's slant along the wall.
 * From the first bead on it swells forward, its back edge held near where it formed, so it
 * grows the way it is about to go
 */
export const DRIP_LEAN = 0.7;
/**
 * A small dot leaves its edge on the inward diagonal, 45 degrees from the edge, give or take
 * this much (degrees) at the middle of the edge: never straight across the screen, which
 * would only bounce back and forth, and never along its edge
 */
export const SMALL_DOT_HEADING_SPREAD = 20;
/**
 * Next to a corner the spread narrows to this much and the dot heads away from the corner,
 * so none sets off into the wall beside it
 */
export const SMALL_DOT_HEADING_SPREAD_AT_CORNER = 8;

/** Point dot rules */
export const POINT_DOT_SIZE_RATIO = 0.125;
export const POINT_DOT_VALUE = 5;
export const POINT_DOT_SIZE_ANIMATION_TIME = 10;
export const POINT_DOT_TIME_BETWEEN = 300;
export const POINT_DOT_FADE_TIME = 150;
export const POINT_DOT_PULSE_SPEED = 12;

/**
 * Point dot placement (see PointDotPlacement and ADR 0002). A point dot's edge stays this far
 * from the player's edge when it spawns: two player widths, so it is never caught by accident
 */
export const POINT_DOT_CLEAR_SPACE_RATIO = 0.25;
/** It is placed from a grid of cells this wide over the spawn area: half a player width */
export const POINT_DOT_CELL_RATIO = 0.0625;
/**
 * Each spawn makes the cells around it less likely for the next ones, out to this far from it
 * (three player widths), by up to POINT_DOT_SUPPRESS_STRENGTH of the way down to the floor
 * weight right where it landed, falling off smoothly to nothing at the edge
 */
export const POINT_DOT_SUPPRESS_RADIUS_RATIO = 0.375;
export const POINT_DOT_SUPPRESS_STRENGTH = 0.7;
/** The least a cell's weight sinks to (from 1), so a recent spot is unlikely, never ruled out */
export const POINT_DOT_WEIGHT_FLOOR = 0.03;
/** Before each spawn every weight moves this fraction of the way back to 1 */
export const POINT_DOT_WEIGHT_RECOVERY = 0.25;

/**
 * Combo rules: a catch at most this many ticks after the one before carries the combo on
 * (533 ms at 30 Hz). Each catch pays its own value plus two for every catch before it in the
 * combo, without limit, so a combo of small dots alone totals its length squared
 */
export const COMBO_WINDOW_TICKS = 16;

/** Player dot rules */
export const PLAYER_DOT_SIZE_RATIO = 0.125;

/**
 * Player speed in px/s per degree of tilt at the default sensitivity, between the dead zone and
 * the top tilt (see shapeTilt in PlayerDot.ts)
 */
export const PLAYER_SPEED_PER_DEGREE = 40;

/** Below this tilt (radians, 1 degree) the player rests */
export const PLAYER_DEAD_ZONE_RAD = Math.PI / 180;

/** From this tilt (radians, 3 degrees) the player moves as fast as the tilt says */
export const PLAYER_FULL_TILT_FROM_RAD = (3 * Math.PI) / 180;

/** Past this tilt (radians, 20 degrees) the player moves no faster */
export const PLAYER_TOP_TILT_RAD = (20 * Math.PI) / 180;

/** The range the tilt sensitivity (a multiple of the default speed) is kept within */
export const TILT_SENSITIVITY_MIN = 0.25;
export const TILT_SENSITIVITY_MAX = 4;

/** Maximum dots in the world simultaneously */
export const DOT_LIMIT = 200;

/** Kiosk mode caps active dots at this count */
export const KIOSK_DOT_LIMIT = 10;

/** The three game colors (legacy colorAlt) */
export const GAME_COLORS = ["#E91E63", "#2196F3", "#8BC34A"] as const;

/** Each time a color is picked, its probability of being picked next is multiplied by this */
export const COLOR_REPEAT_FACTOR = 1 / 3;

/**
 * A caught dot merges into the player like a droplet over this many ticks, then is removed.
 * The first ABSORB_MERGE_FRACTION of that is the dot sliding in; the rest is the player
 * settling back from the swell.
 */
export const ABSORB_TICKS = 14;
export const ABSORB_MERGE_FRACTION = 0.5;

/**
 * Touching a dot of the wrong colour does not end the game at once: the player reaches round
 * the dot, refuses it and spits it out over this many ticks, with the rest of the scene
 * frozen, and only then is the game over
 */
export const REJECT_TICKS = 15;

/**
 * How far through the refusal (0..1) the player springs back and spits the dot out. The
 * presentation draws the press before it and the push after it; the haptic fires as it is
 * crossed.
 */
export const REJECT_SPIT_AT = 0.5;

/** Point-dot pulse contracts to this fraction of full size */
export const POINT_DOT_PULSE_SCALE = 0.85;

/** Settings a fresh install starts with. Copy before use (`{ ...DEFAULT_SETTINGS }`). */
export const DEFAULT_SETTINGS: GameSettings = {
	soundEnabled: true,
	musicEnabled: true,
	tiltSensitivity: 1,
};
