/**
 * Game constants ported from legacy GameRules.java.
 * All ratios are relative to screen density (applied at runtime).
 */

/** Game simulation runs at 30 Hz fixed step */
export const GAME_HERTZ = 30.0;
export const TIME_BETWEEN_UPDATES_NS = 1_000_000_000.0 / GAME_HERTZ;

/** Target render FPS */
export const TARGET_FPS = 60.0;

/** Small dot rules */
export const SMALL_DOT_SPEED_RATIO = 0.02;
export const SMALL_DOT_SIZE_RATIO = 0.0625;
export const SMALL_DOT_CREATE_INTERVAL = 120;

/** Point dot rules */
export const POINT_DOT_SIZE_RATIO = 0.125;
export const POINT_DOT_VALUE = 5;
export const POINT_DOT_SIZE_ANIMATION_TIME = 10;
export const POINT_DOT_TIME_BETWEEN = 300;
export const POINT_DOT_FADE_TIME = 150;
export const POINT_DOT_PULSE_SPEED = 12;

/** Player dot rules */
export const PLAYER_DOT_SIZE_RATIO = 0.125;
export const PLAYER_DOT_SIZE_INCREMENT_SMALL = 0.008;
export const PLAYER_DOT_SIZE_INCREMENT_POINT = 0.02;

/** Player speed in px/s per degree of tilt. Speed follows tilt linearly with no threshold. */
export const PLAYER_SPEED_PER_DEGREE = 40;

/** Difficulty ramp -- spawn interval reaches minimum at this step count */
export const MAX_TIME_DIFFICULTY = 7200;

/** Maximum dots in the world simultaneously */
export const DOT_LIMIT = 200;

/** Kiosk mode caps active dots at this count */
export const KIOSK_DOT_LIMIT = 10;

/** The three game colors (legacy colorAlt) */
export const GAME_COLORS = ["#E91E63", "#2196F3", "#8BC34A"] as const;

/** Each time a color is picked, its probability of being picked next is multiplied by this */
export const COLOR_REPEAT_FACTOR = 1 / 3;

/** Point-dot pulse contracts to this fraction of full size */
export const POINT_DOT_PULSE_SCALE = 0.85;
