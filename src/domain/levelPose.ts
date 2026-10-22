import type { Attitude, Gravity, TiltAngles } from "./types";

/**
 * Tilt measured from a level pose, the way the hand turns the phone: `x` is how far it has
 * turned about its own long axis (right edge away from the eyes), `y` about its short axis (top
 * edge towards them).
 *
 * Tilt is the whole turn of the phone from the level pose, swivel included, read along the
 * phone's own axes at the pose (wholeTilt, ADR 0010), so a roll steers at full strength in
 * every pose. The level pose is then an attitude, made from a saved gravity where the swivel is
 * zeroed (zeroSwivel).
 *
 * Screen down, a turn that tips an edge away from the eyes still reads the way it does screen
 * up. To the hand that is the same tilt, though gravity sees it mirrored.
 *
 * The functions are worklets because the interface measures tilt on the UI thread every frame,
 * with the same arithmetic as the game; the directive is inert outside Reanimated. For the same
 * reason the vector arithmetic is written out in scalars rather than built from small vector
 * helpers, so a frame's reading makes no throwaway vectors.
 */

/**
 * Which of the two level poses: `up`, held screen up, or `down`, turned over (lying back, phone
 * overhead). Set on your side, a pose is still one of these two.
 */
export type PoseSide = "up" | "down";

/** The two level poses, as the gravity each reads */
export type LevelPoses = Readonly<Record<PoseSide, Gravity>>;

/** The level poses before any is set: flat on a table, and flat overhead */
export const FLAT: LevelPoses = {
	up: { x: 0, y: 0, z: -1 },
	down: { x: 0, y: 0, z: 1 },
};

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
	side: PoseSide;
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
 * Which level pose is in use for the phone reading `gravity`, from the gravities the two poses
 * read: the one in use at the last sample, `was`, stays until the other is nearer by
 * TURN_OVER_MARGIN
 */
function sideInUse(gravity: Gravity, up: Gravity, down: Gravity, was: PoseSide): PoseSide {
	"worklet";
	const fromUp = angleBetween(gravity, up);
	const fromDown = angleBetween(gravity, down);
	const turnOver =
		was === "down" ? fromUp + TURN_OVER_MARGIN >= fromDown : fromDown + TURN_OVER_MARGIN < fromUp;
	return turnOver ? "down" : "up";
}

/** The two level poses, as the attitude each is held in */
export type LevelAttitudes = Readonly<Record<PoseSide, Attitude>>;

/**
 * The level poses before any is set: flat on a table, and flat overhead, turned over about the
 * phone's short axis as lying back turns it, so its top edge points the other way in the room
 */
export const FLAT_ATTITUDES: LevelAttitudes = {
	up: { xx: 1, xy: 0, xz: 0, yx: 0, yy: 1, yz: 0, zx: 0, zy: 0, zz: 1 },
	down: { xx: 1, xy: 0, xz: 0, yx: 0, yy: -1, yz: 0, zx: 0, zy: 0, zz: -1 },
};

/** The gravity (unit) the phone reads, held in `attitude` */
export function gravityOf(attitude: Attitude): Gravity {
	"worklet";
	return { x: -attitude.xz, y: -attitude.yz, z: -attitude.zz };
}

/**
 * `attitude` turned about an axis given in the phone's own axes, `(kx, ky, kz)` scaled by the
 * angle. The turn is right-handed: a positive turn about y lowers the right edge of a phone
 * lying flat.
 */
function turnedBy(attitude: Attitude, kx: number, ky: number, kz: number): Attitude {
	"worklet";
	const angle = Math.hypot(kx, ky, kz);
	if (angle < NO_TURN) return attitude;
	const ax = kx / angle;
	const ay = ky / angle;
	const az = kz / angle;
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const t = 1 - c;
	// Where the turn takes the phone's x, y and z axes, in the phone's axes as they were
	const xToX = c + ax * ax * t;
	const xToY = ay * ax * t + az * s;
	const xToZ = az * ax * t - ay * s;
	const yToX = ax * ay * t - az * s;
	const yToY = c + ay * ay * t;
	const yToZ = az * ay * t + ax * s;
	const zToX = ax * az * t + ay * s;
	const zToY = ay * az * t - ax * s;
	const zToZ = c + az * az * t;
	const a = attitude;
	return {
		xx: a.xx * xToX + a.yx * xToY + a.zx * xToZ,
		xy: a.xy * xToX + a.yy * xToY + a.zy * xToZ,
		xz: a.xz * xToX + a.yz * xToY + a.zz * xToZ,
		yx: a.xx * yToX + a.yx * yToY + a.zx * yToZ,
		yy: a.xy * yToX + a.yy * yToY + a.zy * yToZ,
		yz: a.xz * yToX + a.yz * yToY + a.zz * yToZ,
		zx: a.xx * zToX + a.yx * zToY + a.zx * zToZ,
		zy: a.xy * zToX + a.yy * zToY + a.zy * zToZ,
		zz: a.xz * zToX + a.yz * zToY + a.zz * zToZ,
	};
}

/** A turn of the phone, as an axis in its own axes scaled by the angle (radians) */
interface Turn {
	x: number;
	y: number;
	z: number;
	/** The angle (0..pi), whole even at a half turn, where the axis is lost */
	angle: number;
}

/**
 * The shortest turn from the phone held in `from` to it held in `to`, about an axis in `from`'s
 * axes, swivel included
 */
function turnFrom(from: Attitude, to: Attitude): Turn {
	"worklet";
	const p = from;
	const a = to;
	// The axis scaled by the turn's sine, and the cosine of its angle
	const sx =
		(p.zx * a.yx + p.zy * a.yy + p.zz * a.yz - (p.yx * a.zx + p.yy * a.zy + p.yz * a.zz)) / 2;
	const sy =
		(p.xx * a.zx + p.xy * a.zy + p.xz * a.zz - (p.zx * a.xx + p.zy * a.xy + p.zz * a.xz)) / 2;
	const sz =
		(p.yx * a.xx + p.yy * a.xy + p.yz * a.xz - (p.xx * a.yx + p.xy * a.yy + p.xz * a.yz)) / 2;
	const trace =
		p.xx * a.xx +
		p.xy * a.xy +
		p.xz * a.xz +
		p.yx * a.yx +
		p.yy * a.yy +
		p.yz * a.yz +
		p.zx * a.zx +
		p.zy * a.zy +
		p.zz * a.zz;
	const sine = Math.hypot(sx, sy, sz);
	const angle = Math.atan2(sine, (trace - 1) / 2);
	// A turn too small to have an axis is its own sine
	const scale = sine > NO_TURN ? angle / sine : 1;
	return { x: sx * scale, y: sy * scale, z: sz * scale, angle };
}

/**
 * Tilt of the phone held in `attitude`, from the level pose held in `pose`: the whole turn from
 * one to the other, swivel included, read along the phone's own long and short axes at the
 * pose. A roll about the long axis reads in full in every pose, flat, reclined, upright or on
 * your side, and the turn in the screen's own plane reads as nothing in every pose, as the flat
 * spin on a tabletop always did.
 *
 * The axes are the phone's own, so screen down a turn that tips an edge away from the eyes
 * reads the way it does screen up, swivel included.
 */
export function wholeTilt(attitude: Attitude, pose: Attitude): TiltAngles {
	"worklet";
	const turn = turnFrom(pose, attitude);
	// About the long axis is x, about the short axis is y; about the screen's axis is dropped
	return { x: turn.y, y: turn.x };
}

/**
 * How far the phone has turned between attitudes `a` and `b` (radians, 0..pi), about any axis,
 * swivel included: what the stillness holds check, so a phone still turning about the vertical
 * never counts as held
 */
export function turnBetween(a: Attitude, b: Attitude): number {
	"worklet";
	return turnFrom(b, a).angle;
}

/**
 * The phone held in `from`, turned `share` (0..1) of the way to `to` along the shortest turn,
 * swivel included. Each step is a real turn of the phone, so a running mean or a smoothing built
 * from it stays an attitude the phone can be held in, where averaging the axes would shrink and
 * skew them.
 */
export function turnedToward(from: Attitude, to: Attitude, share: number): Attitude {
	"worklet";
	if (share >= 1) return to;
	const turn = turnFrom(from, to);
	return turnedBy(from, turn.x * share, turn.y * share, turn.z * share);
}

/**
 * Tilt of the phone held in `attitude`, from whichever of the level `poses` is in use. Which
 * one is decided by gravity alone, with TURN_OVER_MARGIN, so a swivel never turns the phone
 * over to the other pose.
 */
export function levelWholeTilt(
	attitude: Attitude,
	poses: LevelAttitudes,
	was: PoseSide,
): LevelTilt {
	"worklet";
	const side = sideInUse(gravityOf(attitude), gravityOf(poses.up), gravityOf(poses.down), was);
	const tilt = wholeTilt(attitude, poses[side]);
	return { x: tilt.x, y: tilt.y, side };
}

/**
 * `attitude` turned the shortest way to read `gravity`, so the turn has no swivel. Gravity
 * straight the other way has no shortest turn; then it turns over about the phone's short axis,
 * or its long axis if the short one points along gravity.
 */
function swung(attitude: Attitude, gravity: Gravity): Attitude {
	"worklet";
	const from = gravityOf(attitude);
	const to = unitGravity(gravity);
	// The turn of gravity, as an axis scaled by its sine
	const cx = from.y * to.z - from.z * to.y;
	const cy = from.z * to.x - from.x * to.z;
	const cz = from.x * to.y - from.y * to.x;
	const sine = Math.hypot(cx, cy, cz);
	const cosine = from.x * to.x + from.y * to.y + from.z * to.z;
	if (sine > NO_TURN) {
		// Gravity turns one way in the phone's axes as the phone turns the other
		const scale = -Math.atan2(sine, cosine) / sine;
		return turnedBy(attitude, cx * scale, cy * scale, cz * scale);
	}
	if (cosine > 0) return attitude;
	// The short axis, or failing that the long one, made level
	const short = 1 - from.x * from.x > 0.5;
	const ax = (short ? 1 : 0) - (short ? from.x : from.y) * from.x;
	const ay = (short ? 0 : 1) - (short ? from.x : from.y) * from.y;
	const az = -(short ? from.x : from.y) * from.z;
	const scale = Math.PI / Math.hypot(ax, ay, az);
	return turnedBy(attitude, ax * scale, ay * scale, az * scale);
}

/**
 * The level poses to measure tilt from, zeroing the swivel where the phone is held now: each
 * reads its `saved` gravity, turned about the vertical to face the way the phone in `attitude`
 * faces. The swivel has no true zero and the saved poses keep none, so a pose is only ever
 * held as an attitude in memory, made here when the player is at their level pose by
 * definition.
 *
 * Both poses are zeroed at once. The one the phone is nearer is turned the shortest way from
 * it, so the phone reads no swivel from it now; the other is that one turned over about the
 * phone's short axis, as lying back turns it, then turned the shortest way to its own gravity.
 */
export function zeroSwivel(saved: LevelPoses, attitude: Attitude): LevelAttitudes {
	"worklet";
	const gravity = gravityOf(attitude);
	const up = angleBetween(gravity, saved.up) <= angleBetween(gravity, saved.down);
	const near = swung(attitude, up ? saved.up : saved.down);
	const far = swung(turnedBy(near, Math.PI, 0, 0), up ? saved.down : saved.up);
	return up ? { up: near, down: far } : { up: far, down: near };
}

/**
 * The attitude the phone is held in when tilted by `tilt` from the level pose held in `pose`;
 * undoes wholeTilt. The bench, the pilot and the scripted sensor build their samples with it.
 */
export function attitudeAt(tilt: TiltAngles, pose: Attitude): Attitude {
	"worklet";
	return turnedBy(pose, tilt.y, tilt.x, 0);
}
