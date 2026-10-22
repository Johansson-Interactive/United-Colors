import type { Gravity, TiltAngles } from "./types";

/**
 * Tilt measured from a level pose, the way the hand turns the phone: `x` is how far it has
 * turned about its own long axis (right edge away from the eyes), `y` about its short axis (top
 * edge towards them). Gravity only shows turns about level axes, so these are the shortest
 * turn from the level gravity to the current one, read along the level pose's own axes: the
 * phone's x and y axes laid level.
 *
 * Measured this way, the reading is as steady in any level pose as it is flat. Upright or on
 * your side, the phone's x or y axis points nearly along gravity, so tilt about it can't be
 * seen. Instead its axis takes over the turn in the screen's own plane (as if turning a
 * steering wheel), which gravity does see.
 *
 * Screen down, a turn that tips an edge away from the eyes still reads the way it does screen
 * up. To the hand that is the same tilt, though gravity sees it mirrored.
 */

/** Gravity lying flat on a table, screen up */
export const FLAT_UP: Gravity = { x: 0, y: 0, z: -1 };
/** Gravity held flat overhead, screen down */
export const FLAT_DOWN: Gravity = { x: 0, y: 0, z: 1 };

/**
 * How much nearer the other level pose must be before it takes over (60 degrees). Between flat
 * poses this switches 30 degrees past upright, so holding the phone near upright doesn't flip
 * between them.
 */
const TURN_OVER_MARGIN = Math.PI / 3;

/** Turns smaller than this (radians) read as none, where the turn's axis is lost in rounding */
const NO_TURN = 1e-9;

/** The level tilt and the level pose it was measured from */
export interface LevelTilt extends TiltAngles {
	/** The screen-down pose was the nearer (see levelTilt) */
	facingDown: boolean;
}

/** The same direction at unit length */
export function unitGravity(g: Gravity): Gravity {
	"worklet";
	const length = Math.hypot(g.x, g.y, g.z);
	return { x: g.x / length, y: g.y / length, z: g.z / length };
}

/** The angle between two gravity directions (radians, 0..pi) */
export function angleBetween(a: Gravity, b: Gravity): number {
	"worklet";
	const cx = a.y * b.z - a.z * b.y;
	const cy = a.z * b.x - a.x * b.z;
	const cz = a.x * b.y - a.y * b.x;
	return Math.atan2(Math.hypot(cx, cy, cz), a.x * b.x + a.y * b.y + a.z * b.z);
}

/**
 * The level pose's axes (unit, at right angles to gravity): `ux` the phone's x axis laid level,
 * which tilt `y` turns about, and `uy` its y axis, which tilt `x` turns about. Both are drawn
 * from the phone's x and y axes together, each counting as much as it lies level, so they hold
 * in any pose.
 */
function levelAxes(level: Gravity) {
	"worklet";
	const length = Math.hypot(level.x, level.y, level.z);
	// Up at the level pose
	const nx = -level.x / length;
	const ny = -level.y / length;
	const nz = -level.z / length;
	// Screen down the axes keep the phone's own sense rather than gravity's
	const side = nz >= 0 ? 1 : -1;
	// The phone's x axis laid level, plus its y axis laid level and turned onto x (their sum is
	// never shorter than 1, so it always has a direction)
	const ax = 1 - nx * nx;
	const ay = -nx * ny;
	const az = -nx * nz;
	const bx = -ny * nx;
	const by = 1 - ny * ny;
	const bz = -ny * nz;
	const vx = ax + side * (by * nz - bz * ny);
	const vy = ay + side * (bz * nx - bx * nz);
	const vz = az + side * (bx * ny - by * nx);
	const v = Math.hypot(vx, vy, vz);
	const uxX = vx / v;
	const uxY = vy / v;
	const uxZ = vz / v;
	return {
		uxX,
		uxY,
		uxZ,
		uyX: side * (ny * uxZ - nz * uxY),
		uyY: side * (nz * uxX - nx * uxZ),
		uyZ: side * (nx * uxY - ny * uxX),
	};
}

/** Tilt of the phone reading `gravity`, from the level pose reading `level` */
export function tiltFrom(gravity: Gravity, level: Gravity): TiltAngles {
	"worklet";
	// The shortest turn of the phone from level to now, as an axis scaled by its angle
	const cx = gravity.y * level.z - gravity.z * level.y;
	const cy = gravity.z * level.x - gravity.x * level.z;
	const cz = gravity.x * level.y - gravity.y * level.x;
	const sine = Math.hypot(cx, cy, cz);
	const cosine = gravity.x * level.x + gravity.y * level.y + gravity.z * level.z;
	// Lengths cancel in the angle; a turn too small to have an axis scales as its sine
	const scale =
		sine > NO_TURN
			? Math.atan2(sine, cosine) / sine
			: 1 / (Math.hypot(gravity.x, gravity.y, gravity.z) * Math.hypot(level.x, level.y, level.z));
	const axes = levelAxes(level);
	return {
		x: (cx * axes.uyX + cy * axes.uyY + cz * axes.uyZ) * scale,
		y: (cx * axes.uxX + cy * axes.uxY + cz * axes.uxZ) * scale,
	};
}

/** The gravity (unit) the phone reads when tilted by `tilt` from `level`; undoes tiltFrom */
export function gravityAt(tilt: TiltAngles, level: Gravity): Gravity {
	"worklet";
	const axes = levelAxes(level);
	const l = unitGravity(level);
	// The turn as an axis scaled by its angle; gravity turns the other way in the phone's axes
	const kx = tilt.x * axes.uyX + tilt.y * axes.uxX;
	const ky = tilt.x * axes.uyY + tilt.y * axes.uxY;
	const kz = tilt.x * axes.uyZ + tilt.y * axes.uxZ;
	const angle = Math.hypot(kx, ky, kz);
	if (angle < NO_TURN) return l;
	const sin = Math.sin(angle) / angle;
	const cos = Math.cos(angle);
	// The axis is level, so at right angles to `l`
	return {
		x: l.x * cos - (ky * l.z - kz * l.y) * sin,
		y: l.y * cos - (kz * l.x - kx * l.z) * sin,
		z: l.z * cos - (kx * l.y - ky * l.x) * sin,
	};
}

/**
 * Tilt from whichever level pose the phone is nearer, `up` (held screen up) or `down` (turned
 * over). The one in use, from the last sample, stays until the other is nearer by
 * TURN_OVER_MARGIN, so a phone held between them doesn't flip back and forth.
 */
export function levelTilt(
	gravity: Gravity,
	up: Gravity,
	down: Gravity,
	wasFacingDown: boolean,
): LevelTilt {
	"worklet";
	const fromUp = angleBetween(gravity, up);
	const fromDown = angleBetween(gravity, down);
	const facingDown = wasFacingDown
		? fromUp + TURN_OVER_MARGIN >= fromDown
		: fromDown + TURN_OVER_MARGIN < fromUp;
	const tilt = tiltFrom(gravity, facingDown ? down : up);
	return { x: tilt.x, y: tilt.y, facingDown };
}
