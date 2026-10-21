/**
 * The frost over the frozen field (see fieldFrosted): the game canvas blurs and dims the scene
 * by the frost amount, and Get ready opens a window in it, a circle of the field left sharp and
 * full colour at the seat (see getReady.ts). No React, so the canvas and the steppers share it.
 */

/** A circle of the frosted field left clear, in stage px; a zero radius is no window */
export interface FrostWindow {
	x: number;
	y: number;
	radius: number;
}

export const NO_FROST_WINDOW: FrostWindow = { x: 0, y: 0, radius: 0 };

/** How dark the frosted scene is dimmed at full frost (the ink laid over it) */
export const FROST_MAX_DIM = 0.5;
