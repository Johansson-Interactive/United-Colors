/**
 * The player's liquid body: its mass trails the player on a damped spring, so the drop is
 * drawn out while it moves, overshoots when it stops (against a wall too) and sloshes back
 * before it settles. Free dots are rigid glass; only the player behaves like this, which is
 * what marks it as the player's own dot.
 *
 * Pure and stepped once per rendered frame: by the scene builder for the player, and on the
 * UI thread for the play button, which is a drop of the same liquid. The shader turns the
 * output into an area-preserving ellipse plus a slow edge wobble (see liquidShader.ts).
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

/** The spring's own state between frames */
export interface JellyBody {
	/** Lag of the body's mass behind the drop (px) and its rate of change (px/s) */
	lagX: number;
	lagY: number;
	lagVX: number;
	lagVY: number;
	/** Wobble clock in seconds */
	wobble: number;
	/** Where the drop was last frame; null before the first */
	lastX: number | null;
	lastY: number | null;
}

export const JELLY_AT_REST: JellyBody = {
	lagX: 0,
	lagY: 0,
	lagVX: 0,
	lagVY: 0,
	wobble: 0,
	lastX: null,
	lastY: null,
};

/**
 * Advance `body` by `dtMs` with the drop at (x, y) and radius `radius`; returns the new body.
 * `dtMs` of 0 (paused, a redraw) leaves the body exactly as it was. A worklet, so a drop in
 * the interface can run it on the UI thread.
 */
export function stepJelly(
	body: JellyBody,
	x: number,
	y: number,
	radius: number,
	dtMs: number,
): JellyBody {
	"worklet";
	const omega = 2 * Math.PI * JELLY_HZ;
	const damping = 2 * JELLY_DAMPING * omega;
	let { lagX, lagY, lagVX, lagVY, wobble } = body;
	if (body.lastX === null || body.lastY === null || radius <= 0) {
		lagX = 0;
		lagY = 0;
		lagVX = 0;
		lagVY = 0;
	} else if (dtMs > 0) {
		const dx = x - body.lastX;
		const dy = y - body.lastY;
		if (Math.hypot(dx, dy) > JELLY_TELEPORT_RADII * radius) {
			lagX = 0;
			lagY = 0;
			lagVX = 0;
			lagVY = 0;
		} else {
			// The mass stays put as the drop moves out from under it, and the spring pulls it
			// back after. Spread the move evenly over the substeps.
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
	return { lagX, lagY, lagVX, lagVY, wobble, lastX: x, lastY: y };
}

/**
 * `body` with its mass knocked at (`vx`, `vy`) px/s, as by a catch landing on the drop: it
 * sloshes along the knock and settles as after a sudden stop. A worklet.
 */
export function kickJelly(body: JellyBody, vx: number, vy: number): JellyBody {
	"worklet";
	return { ...body, lagVX: body.lagVX + vx, lagVY: body.lagVY + vy };
}

/** The shape to draw for `body` on a drop of radius `radius` */
export function jellyShape(body: JellyBody, radius: number): JellyState {
	"worklet";
	const lag = Math.hypot(body.lagX, body.lagY);
	if (lag <= 1e-6 || radius <= 0) return { stretchX: 0, stretchY: 0, wobble: body.wobble };
	// The mass trails the motion, so the drop is long along the lag either way
	const stretch = JELLY_MAX_STRETCH * Math.tanh((JELLY_STRETCH_GAIN * lag) / radius);
	return {
		stretchX: (body.lagX / lag) * stretch,
		stretchY: (body.lagY / lag) * stretch,
		wobble: body.wobble,
	};
}

/** A jelly that keeps its own body: step it once per frame with the drop's position */
export function createJelly() {
	let body = JELLY_AT_REST;
	return function step(x: number, y: number, radius: number, dtMs: number): JellyState {
		body = stepJelly(body, x, y, radius, dtMs);
		return jellyShape(body, radius);
	};
}
