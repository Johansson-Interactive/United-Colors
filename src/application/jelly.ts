/**
 * The player's liquid body: its mass trails the player on a damped spring, so the drop is
 * drawn out while it moves, overshoots when it stops (against a wall too) and sloshes back
 * before it settles. Free dots are rigid glass; only the player behaves like this, which is
 * what marks it as the player's own dot.
 *
 * Pure and stepped once per rendered frame by the scene builder; the shader turns the output
 * into an area-preserving ellipse plus a slow edge wobble.
 */

/** Spring frequency (Hz) of the slosh */
const JELLY_HZ = 3;
/** Damping ratio: under 1, so a sudden stop overshoots once or twice before settling */
const JELLY_DAMPING = 0.35;
/** Most the drop may stretch along its long axis, as a fraction of its radius */
export const JELLY_MAX_STRETCH = 0.16;
/** How quickly stretch rises with lag (per radius of lag) before easing into the max */
const JELLY_STRETCH_GAIN = 0.6;
/** A jump of more than this many radii in one frame is a respawn, not motion: reset */
const JELLY_TELEPORT_RADII = 3;
/** Longest integration step (ms), so slow frames stay stable */
const JELLY_SUBSTEP_MS = 1000 / 120;
/** The wobble clock wraps here; the shader's wobble speeds are whole cycles per period */
export const JELLY_WOBBLE_PERIOD_S = 20;

export interface JellyState {
	/** Stretch vector: direction of the long axis, length 0..JELLY_MAX_STRETCH */
	stretchX: number;
	stretchY: number;
	/** Wobble clock in seconds, 0..JELLY_WOBBLE_PERIOD_S */
	wobble: number;
}

export function createJelly() {
	const omega = 2 * Math.PI * JELLY_HZ;
	const damping = 2 * JELLY_DAMPING * omega;
	// Lag of the body's mass behind the player (px) and its rate of change (px/s)
	let lagX = 0;
	let lagY = 0;
	let lagVX = 0;
	let lagVY = 0;
	let wobble = 0;
	let last: { x: number; y: number } | null = null;
	const state: JellyState = { stretchX: 0, stretchY: 0, wobble: 0 };

	const reset = () => {
		lagX = 0;
		lagY = 0;
		lagVX = 0;
		lagVY = 0;
	};

	/**
	 * Advance by `dtMs` with the player at (x, y) and radius `radius`; returns the shape to
	 * draw. `dtMs` of 0 (paused, a redraw) leaves the body exactly as it was.
	 */
	return function step(x: number, y: number, radius: number, dtMs: number): JellyState {
		if (last === null || radius <= 0) {
			reset();
		} else if (dtMs > 0) {
			const dx = x - last.x;
			const dy = y - last.y;
			if (Math.hypot(dx, dy) > JELLY_TELEPORT_RADII * radius) {
				reset();
			} else {
				// The mass stays put as the player moves out from under it, and the spring pulls
				// it back after. Spread the move evenly over the substeps.
				const steps = Math.ceil(dtMs / JELLY_SUBSTEP_MS);
				const h = dtMs / steps / 1000;
				for (let i = 0; i < steps; i++) {
					lagX -= dx / steps;
					lagY -= dy / steps;
					lagVX += (-omega * omega * lagX - damping * lagVX) * h;
					lagVY += (-omega * omega * lagY - damping * lagVY) * h;
					lagX += lagVX * h;
					lagY += lagVY * h;
				}
				wobble = (wobble + dtMs / 1000) % JELLY_WOBBLE_PERIOD_S;
			}
		}
		last = { x, y };

		const lag = Math.hypot(lagX, lagY);
		// The mass trails the motion, so the drop is long along the lag either way
		const stretch =
			lag > 1e-6 && radius > 0
				? JELLY_MAX_STRETCH * Math.tanh((JELLY_STRETCH_GAIN * lag) / radius)
				: 0;
		state.stretchX = lag > 1e-6 ? (lagX / lag) * stretch : 0;
		state.stretchY = lag > 1e-6 ? (lagY / lag) * stretch : 0;
		state.wobble = wobble;
		return state;
	};
}
