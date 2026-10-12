/**
 * How dots meet the walls, as pure curves and a little geometry (see renderScene.ts):
 *
 * - A forming drip is drawn out along the heading it grows toward (DRIP_STRETCH), and once
 *   it has shot off its wall, further still as it tears free (launchStretch).
 * - The player pushed into a wall presses into it as hard as they push (pressDepth); the
 *   press follows the push with a short lag (stepPress), so a trembling tilt never flickers.
 * - A body pressed into a wall keeps its area, so it widens along the wall (pressedRadius).
 *
 * The walls only ever change how a dot is drawn: every dot is still caught on its circle.
 */

/** How far a forming drip is drawn out along its heading, as a fraction of its radius */
export const DRIP_STRETCH = 0.15;
/** How much further a launched drip is drawn out halfway through its launch */
export const LAUNCH_STRETCH = 0.25;
/** Width of the fillet joining a drip to its wall, as a fraction of its full radius */
export const DRIP_NECK = 1;
/** The deepest the player presses into a wall, as a fraction of its radius */
export const PLAYER_PRESS = 0.3;
/** The push (px/s held back by the wall) at which the player's press is three quarters of its deepest */
export const PLAYER_PUSH_SPEED = 300;
/** Width of the player's wet fillet at the deepest press, as a fraction of its radius */
export const PLAYER_NECK = 0.5;
/** How quickly the player's press follows a rising push, and a falling one (ms) */
const PRESS_ATTACK_MS = 50;
const PRESS_RELEASE_MS = 90;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/**
 * How far a launched drip is drawn out along its heading at progress 0..1 of its launch, as
 * a fraction of its radius: as long as it was forming as it leaves the wall, longer through
 * the tear, round again by the end
 */
export function launchStretch(progress: number): number {
	const l = clamp01(progress);
	return DRIP_STRETCH * (1 - l) + LAUNCH_STRETCH * 4 * l * (1 - l);
}

/** How far (px) a player of radius `radius` presses into a wall holding back `push` px/s */
export function pressDepth(push: number, radius: number): number {
	return radius * PLAYER_PRESS * Math.tanh(Math.abs(push) / PLAYER_PUSH_SPEED);
}

/** Within this much (px/s) of its target the smoothed push snaps to it, so a release ends */
const PRESS_SNAP = 0.5;

/** The smoothed push after `dtMs` chasing `target`; unchanged with no time elapsed */
export function stepPress(current: number, target: number, dtMs: number): number {
	if (dtMs <= 0) return current;
	const tau = Math.abs(target) > Math.abs(current) ? PRESS_ATTACK_MS : PRESS_RELEASE_MS;
	const next = current + (target - current) * (1 - Math.exp(-dtMs / tau));
	return Math.abs(next - target) < PRESS_SNAP ? target : next;
}

/**
 * The radius to draw a circle of radius `radius` at once its centre is pushed `press` px
 * into a wall, so that the part left on the screen side keeps the circle's area
 */
export function pressedRadius(radius: number, press: number): number {
	if (press <= 0 || radius <= 0) return radius;
	const centre = radius - press;
	let drawn = radius;
	for (let i = 0; i < 4; i++) {
		const u = Math.max(-1, Math.min(1, centre / drawn));
		// Area left of a unit circle whose centre is u from the wall
		const kept = Math.PI - Math.acos(u) + u * Math.sqrt(1 - u * u);
		drawn = radius * Math.sqrt(Math.PI / kept);
	}
	return drawn;
}
