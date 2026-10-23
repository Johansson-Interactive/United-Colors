import type { Attitude, Gravity, PoseSide, SavedLevelPoses, TiltAngles } from "./types";

/**
 * Tilt measured from a level pose, the way the hand turns the phone: `x` is how far it has
 * turned about its own long axis (right edge away from the eyes), `y` about its short axis (top
 * edge towards them).
 *
 * Tilt is read from gravity alone (gravityTilt, ADR 0014): the level pose is a gravity, and only
 * a turn that moves gravity steers. The player turning on the spot never moves gravity, so it
 * never moves the dot, in any pose. Reclined, gravity sees only part of a roll; that part is
 * scaled back to the whole roll while the pose is within WHEEL_FROM of flat, and nearer upright
 * the same movement of gravity is read as the screen turned like a steering wheel.
 *
 * Screen down, a turn that tips an edge away from the eyes still reads the way it does screen
 * up. To the hand that is the same tilt, though gravity sees it mirrored.
 *
 * The functions the interface calls every frame on the UI thread (the settle bowl's hold and
 * smoothing) are worklets, with the same arithmetic as the game; the directive is inert outside
 * Reanimated.
 */

/** The two level poses, as the gravity each reads */
export type LevelPoses = Readonly<Record<PoseSide, Gravity>>;

/**
 * How much nearer the other level pose must be before it takes over (60 degrees). Between flat
 * poses this switches 30 degrees past upright, so holding the phone near upright doesn't flip
 * between them.
 */
const TURN_OVER_MARGIN = Math.PI / 3;

/**
 * How much of a roll about the screen's lost axis gravity must see, at the level pose, for the
 * roll to be scaled back to its whole size (cos 60 degrees: the pose reclined up to 60 degrees
 * from flat, a roll read at up to twice what gravity sees). Nearer upright, scaling further would
 * blow sensor jitter up, so that movement of gravity is read as the screen turned like a
 * steering wheel instead, at full size upright (ADR 0014).
 */
const WHEEL_FROM = 0.5;

/** A level pose this near flat has no lost axis: every tip reads as gravity sees it */
const FLAT_ENOUGH = 1e-6;

/** Turns smaller than this (radians) read as none, where the turn's axis is lost in rounding */
const NO_TURN = 1e-9;

// Three-vector arithmetic. A gravity, a phone axis as it points in the room and a turn as an
// axis scaled by its angle are all one of these.

interface Vector {
	x: number;
	y: number;
	z: number;
}

function dot(a: Vector, b: Vector): number {
	"worklet";
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector, b: Vector): Vector {
	"worklet";
	return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function lengthOf(v: Vector): number {
	"worklet";
	return Math.hypot(v.x, v.y, v.z);
}

function scaled(v: Vector, by: number): Vector {
	"worklet";
	return { x: v.x * by, y: v.y * by, z: v.z * by };
}

/** `v` turned by `angle` about the unit `axis`, right-handed (Rodrigues) */
function rotated(v: Vector, axis: Vector, angle: number): Vector {
	"worklet";
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const k = cross(axis, v);
	const along = dot(axis, v) * (1 - c);
	return {
		x: v.x * c + k.x * s + axis.x * along,
		y: v.y * c + k.y * s + axis.y * along,
		z: v.z * c + k.z * s + axis.z * along,
	};
}

/**
 * The shortest turn taking direction `from` to `to` (both unit), as an axis scaled by its angle;
 * none when they already agree, and null when they point straight apart, where no turn is
 * shortest
 */
function directionTurn(from: Vector, to: Vector): Vector | null {
	"worklet";
	const axis = cross(from, to);
	const sine = lengthOf(axis);
	const cosine = dot(from, to);
	if (sine > NO_TURN) return scaled(axis, Math.atan2(sine, cosine) / sine);
	return cosine > 0 ? { x: 0, y: 0, z: 0 } : null;
}

// The phone's own axes, as they point in the room while it is held in an attitude

function axisX(a: Attitude): Vector {
	"worklet";
	return { x: a.xx, y: a.xy, z: a.xz };
}

function axisY(a: Attitude): Vector {
	"worklet";
	return { x: a.yx, y: a.yy, z: a.yz };
}

function axisZ(a: Attitude): Vector {
	"worklet";
	return { x: a.zx, y: a.zy, z: a.zz };
}

function attitudeOf(x: Vector, y: Vector, z: Vector): Attitude {
	"worklet";
	return { xx: x.x, xy: x.y, xz: x.z, yx: y.x, yy: y.y, yz: y.z, zx: z.x, zy: z.y, zz: z.z };
}

/** The same direction at unit length */
export function unitGravity(g: Gravity): Gravity {
	"worklet";
	const length = lengthOf(g);
	return { x: g.x / length, y: g.y / length, z: g.z / length };
}

/** The angle between two gravity directions (radians, 0..pi) */
export function angleBetween(a: Gravity, b: Gravity): number {
	"worklet";
	return Math.atan2(lengthOf(cross(a, b)), dot(a, b));
}

/** The gravity (unit) the phone reads, held in `attitude` */
export function gravityOf(attitude: Attitude): Gravity {
	"worklet";
	return { x: -attitude.xz, y: -attitude.yz, z: -attitude.zz };
}

/**
 * The level poses before any is set: flat on a table, and flat overhead, turned over about the
 * phone's short axis as lying back turns it, so its top edge points the other way in the room
 */
export const FLAT_ATTITUDES: Readonly<Record<PoseSide, Attitude>> = {
	up: { xx: 1, xy: 0, xz: 0, yx: 0, yy: 1, yz: 0, zx: 0, zy: 0, zz: 1 },
	down: { xx: 1, xy: 0, xz: 0, yx: 0, yy: -1, yz: 0, zx: 0, zy: 0, zz: -1 },
};

/** The level poses before any is set, as the gravity each reads */
export const FLAT: LevelPoses = {
	up: gravityOf(FLAT_ATTITUDES.up),
	down: gravityOf(FLAT_ATTITUDES.down),
};

/** The level poses to measure from: each saved one, and flat where none is set */
export function levelPosesOf(saved: SavedLevelPoses): LevelPoses {
	return { up: saved.up ?? FLAT.up, down: saved.down ?? FLAT.down };
}

/**
 * `attitude` turned by `turn`, an axis given in the phone's own axes scaled by the angle. The
 * turn is right-handed: a positive turn about y lowers the right edge of a phone lying flat.
 */
function turnedBy(attitude: Attitude, turn: Vector): Attitude {
	"worklet";
	const angle = lengthOf(turn);
	if (angle < NO_TURN) return attitude;
	const x = axisX(attitude);
	const y = axisY(attitude);
	const z = axisZ(attitude);
	// The same axis as it points in the room; every phone axis turns about it alike
	const k = scaled(turn, 1 / angle);
	const axis: Vector = {
		x: x.x * k.x + y.x * k.y + z.x * k.z,
		y: x.y * k.x + y.y * k.y + z.y * k.z,
		z: x.z * k.x + y.z * k.y + z.z * k.z,
	};
	return attitudeOf(rotated(x, axis, angle), rotated(y, axis, angle), rotated(z, axis, angle));
}

/** A turn of the phone, as an axis in its own axes scaled by the angle (radians) */
interface Turn extends Vector {
	/** The angle (0..pi), whole even at a half turn, where the axis is lost */
	angle: number;
}

/**
 * The shortest turn from the phone held in `from` to it held in `to`, about an axis in `from`'s
 * axes, swivel included
 */
function turnFrom(from: Attitude, to: Attitude): Turn {
	"worklet";
	const px = axisX(from);
	const py = axisY(from);
	const pz = axisZ(from);
	const ax = axisX(to);
	const ay = axisY(to);
	const az = axisZ(to);
	// The axis scaled by the turn's sine, and the cosine of its angle
	const s: Vector = {
		x: (dot(pz, ay) - dot(py, az)) / 2,
		y: (dot(px, az) - dot(pz, ax)) / 2,
		z: (dot(py, ax) - dot(px, ay)) / 2,
	};
	const trace = dot(px, ax) + dot(py, ay) + dot(pz, az);
	const sine = lengthOf(s);
	const angle = Math.atan2(sine, (trace - 1) / 2);
	// A turn too small to have an axis is its own sine
	return { ...scaled(s, sine > NO_TURN ? angle / sine : 1), angle };
}

/**
 * Which level pose is in use for the phone reading `gravity`, from the gravities the two poses
 * read: the one in use at the last sample, `was`, stays until the other is nearer by
 * TURN_OVER_MARGIN
 */
function sideInUse(gravity: Gravity, up: Gravity, down: Gravity, was: PoseSide): PoseSide {
	const fromUp = angleBetween(gravity, up);
	const fromDown = angleBetween(gravity, down);
	const turnOver =
		was === "down" ? fromUp + TURN_OVER_MARGIN >= fromDown : fromDown + TURN_OVER_MARGIN < fromUp;
	return turnOver ? "down" : "up";
}

/**
 * Tilt of the phone held in `attitude`, from the level pose that reads gravity `pose`, from
 * gravity alone, along the phone's own long and short axes. A turn about the vertical never
 * moves gravity, so the player turning on the spot reads as nothing in every pose.
 *
 * Gravity's turn from the pose splits along two directions on the screen. Tipping about the one
 * that lies level at the pose (the short axis, held reclined) moves gravity in full and reads as
 * it is. Rolling about the other, which points downhill on the screen at the pose, moves gravity
 * by only its share of the roll, cos of how far the pose is reclined: within WHEEL_FROM that
 * share is scaled back to the whole roll. Turning the screen like a steering wheel moves gravity
 * the same way, by the rest, so nearer upright the movement is read as the wheel, which
 * upright reads in full: turned clockwise it lowers the right edge, as the roll it stands in
 * for does reclined. Flat there is no lost axis and every tip reads as gravity sees it.
 *
 * The axes are the phone's own, so screen down a turn that tips an edge away from the eyes
 * reads the way it does screen up. Near upright the wheel reads the same way round on either
 * side of the vertical.
 */
export function gravityTilt(attitude: Attitude, pose: Gravity): TiltAngles {
	"worklet";
	const level = unitGravity(pose);
	// The phone's turn from the pose to now, as gravity sees it: gravity turns one way in the
	// phone's axes as the phone turns the other
	const turn = directionTurn(gravityOf(attitude), level);
	// Turned right over, no turn is shortest: read it as a half turn about the short axis
	if (!turn) return { x: 0, y: Math.PI };
	const lean = Math.hypot(level.x, level.y);
	// About the long axis is x, about the short axis is y
	if (lean < FLAT_ENOUGH) return { x: turn.y, y: turn.x };
	// Downhill on the screen at the pose, and the screen's direction that lies level there
	const downhill = { x: level.x / lean, y: level.y / lean, z: 0 };
	const across = { x: -downhill.y, y: downhill.x, z: 0 };
	// How far gravity moved along the wheel's way: the screen's axis, square to gravity
	const wheelWay = {
		x: (-level.z * level.x) / lean,
		y: (-level.z * level.y) / lean,
		z: (1 - level.z * level.z) / lean,
	};
	const moved = dot(turn, wheelWay);
	const seen = Math.abs(level.z);
	const roll =
		seen >= WHEEL_FROM
			? -moved / level.z
			: moved * (1 + (1 / WHEEL_FROM - 1) * (seen / WHEEL_FROM));
	const tip = dot(turn, across);
	const x = across.x * tip + downhill.x * roll;
	const y = across.y * tip + downhill.y * roll;
	return { x: y, y: x };
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
	return turnedBy(from, scaled(turnFrom(from, to), share));
}

/** The level tilt and the level pose it was measured from */
export interface LevelTilt extends TiltAngles {
	side: PoseSide;
}

/**
 * Tilt of the phone held in `attitude`, from whichever of the level `poses` is in use, given
 * the one in use at the last reading, `was`. Which one is decided by gravity, with
 * TURN_OVER_MARGIN.
 */
export function levelTilt(attitude: Attitude, poses: LevelPoses, was: PoseSide): LevelTilt {
	const side = sideInUse(gravityOf(attitude), unitGravity(poses.up), unitGravity(poses.down), was);
	const tilt = gravityTilt(attitude, poses[side]);
	return { x: tilt.x, y: tilt.y, side };
}

/**
 * The phone held in `pose`, then turned by `tilt` about its own long and short axes. From a flat
 * pose that undoes gravityTilt; the bench, the pilot and the scripted sensor build their
 * samples with it.
 */
export function attitudeAt(tilt: TiltAngles, pose: Attitude): Attitude {
	"worklet";
	return turnedBy(pose, { x: tilt.y, y: tilt.x, z: 0 });
}
