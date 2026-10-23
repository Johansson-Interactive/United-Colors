import type { Attitude, Gravity, PoseSide, SavedLevelPoses, TiltAngles } from "./types";

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
 * The functions the interface calls every frame on the UI thread (the settle bowl's hold and
 * smoothing) are worklets, with the same arithmetic as the game; the directive is inert outside
 * Reanimated.
 */

/** The two level poses, as the gravity each reads */
export type LevelPoses = Readonly<Record<PoseSide, Gravity>>;

/** The two level poses, as the attitude each is held in */
export type LevelAttitudes = Readonly<Record<PoseSide, Attitude>>;

/**
 * How much nearer the other level pose must be before it takes over (60 degrees). Between flat
 * poses this switches 30 degrees past upright, so holding the phone near upright doesn't flip
 * between them.
 */
const TURN_OVER_MARGIN = Math.PI / 3;

/**
 * How far a lean may reach, in any direction and in any pose, before the swivel zero follows
 * the phone (45 degrees), well past any useful speed. Beyond it the swivel is the player
 * turning on the spot, not steering (ADR 0013).
 */
const SWIVEL_REACH = Math.PI / 4;

/** How quickly the swivel zero catches up once dragged: the time it takes to close all but 1/e (ms) */
const SWIVEL_CATCH_UP_MS = 200;

/** Swivel left (radians) at which the zero has caught up and stops following */
const SWIVEL_CAUGHT_UP = Math.PI / 180;

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
export const FLAT_ATTITUDES: LevelAttitudes = {
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
	return turnedBy(from, scaled(turnFrom(from, to), share));
}

/** The level tilt and the level pose it was measured from */
export interface LevelTilt extends TiltAngles {
	side: PoseSide;
}

/**
 * Tilt of the phone held in `attitude`, from whichever of the level `poses` is in use, given
 * the one in use at the last reading, `was`. Which one is decided by gravity alone, with
 * TURN_OVER_MARGIN, so a swivel never turns the phone over to the other pose.
 */
export function levelTilt(attitude: Attitude, poses: LevelAttitudes, was: PoseSide): LevelTilt {
	const side = sideInUse(gravityOf(attitude), gravityOf(poses.up), gravityOf(poses.down), was);
	const tilt = wholeTilt(attitude, poses[side]);
	return { x: tilt.x, y: tilt.y, side };
}

/**
 * Gravity's turn from flat on `side` for the phone held in `attitude`: its tilt from that flat
 * pose swung to face the way the phone faces, so no swivel reads, only how far and which way
 * the screen has tipped. Turned right over, it reads a half turn about the phone's short axis.
 */
export function tiltFromFlat(attitude: Attitude, side: PoseSide): TiltAngles {
	"worklet";
	// The turn that takes gravity from now back to flat; the phone turned the other way about
	// the same axis, from flat to now
	const turn = directionTurn(gravityOf(attitude), FLAT[side]);
	if (!turn) return { x: 0, y: Math.PI };
	// About the long axis is x, about the short axis is y
	return { x: turn.y, y: turn.x };
}

/**
 * `attitude` turned the shortest way to read `gravity`, so the turn has no swivel. Gravity
 * straight the other way has no shortest turn; then it turns over about the phone's short axis,
 * or its long axis if the short one points along gravity.
 */
function swung(attitude: Attitude, gravity: Gravity): Attitude {
	const from = gravityOf(attitude);
	const turn = directionTurn(from, unitGravity(gravity));
	// Gravity turns one way in the phone's axes as the phone turns the other
	if (turn) return turnedBy(attitude, scaled(turn, -1));
	// The short axis, or failing that the long one, made level
	const axis: Vector = 1 - from.x * from.x > 0.5 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
	const along = dot(axis, from);
	const level = { x: axis.x - along * from.x, y: axis.y - along * from.y, z: -along * from.z };
	return turnedBy(attitude, scaled(level, Math.PI / lengthOf(level)));
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
	const gravity = gravityOf(attitude);
	const up = angleBetween(gravity, saved.up) <= angleBetween(gravity, saved.down);
	const near = swung(attitude, up ? saved.up : saved.down);
	const far = swung(turnedBy(near, { x: Math.PI, y: 0, z: 0 }), up ? saved.down : saved.up);
	return up ? { up: near, down: far } : { up: far, down: near };
}

/** The vertical in the room, pointing up */
const UP: Vector = { x: 0, y: 0, z: 1 };

/** The phone held in `attitude`, turned `angle` about the vertical, anticlockwise from above */
export function swivelledBy(attitude: Attitude, angle: number): Attitude {
	if (angle === 0) return attitude;
	return attitudeOf(
		rotated(axisX(attitude), UP, angle),
		rotated(axisY(attitude), UP, angle),
		rotated(axisZ(attitude), UP, angle),
	);
}

/**
 * The swivel of the phone held in `attitude` from the pose held in `pose` (radians, -pi..pi,
 * anticlockwise from above): the turn between them, as it acts in the room, split into a turn
 * about a level axis and one about the vertical, which this is
 */
function swivelFrom(pose: Attitude, attitude: Attitude): number {
	const p = [axisX(pose), axisY(pose), axisZ(pose)];
	const a = [axisX(attitude), axisY(attitude), axisZ(attitude)];
	// From the room's turn matrix, the sum over the phone's axes of a pose axis taken to its
	// place now: twice the swivel's half-angle sine, against one plus the trace
	let across = 0;
	let trace = 0;
	for (let i = 0; i < 3; i++) {
		across += a[i].y * p[i].x - a[i].x * p[i].y;
		trace += dot(a[i], p[i]);
	}
	return 2 * Math.atan2(across, 1 + trace);
}

/** How far to swing the swivel zero for one sample, and whether it is still catching up after */
export interface SwivelFollow {
	/** About the vertical, anticlockwise from above (radians); see swivelledBy */
	turn: number;
	catchingUp: boolean;
}

/**
 * How the swivel zero follows the player turning on the spot, for the phone held in `attitude`
 * a sample `dtMs` after the last, measured from `pose`, the level pose in use (ADR 0013).
 *
 * Gravity cannot tell a player turning on the spot from a swivel that steers, but a lean only
 * ever reaches SWIVEL_REACH; the swivel such a lean holds is its share of the turn about the
 * vertical, which is all of it upright and none of it flat. A swivel past that is a turn, so
 * the zero is dragged along at once, and then catches up the rest of the way, until the phone
 * reads no swivel again. Inside the reach the zero stays put, so a held lean keeps its full
 * strength. Flat, where a swivel steers nothing, the zero follows every swivel at once and tilt
 * is gravity's turn, as before ADR 0010.
 */
export function followSwivel(
	attitude: Attitude,
	pose: Attitude,
	catchingUp: boolean,
	dtMs: number,
): SwivelFollow {
	const swivel = swivelFrom(pose, attitude);
	// How level the vertical lies in the phone at the pose: how much a swivel steers
	const steers = Math.hypot(pose.xz, pose.yz);
	const reach = 2 * Math.atan(steers * Math.tan(SWIVEL_REACH / 2));
	const past = Math.abs(swivel) - reach;
	if (past <= 0 && !catchingUp) return { turn: 0, catchingUp: false };
	const dragged = past > 0 ? Math.sign(swivel) * past : 0;
	const rest = (swivel - dragged) * (1 - Math.exp(-dtMs / SWIVEL_CATCH_UP_MS));
	if (Math.abs(swivel - dragged - rest) < SWIVEL_CAUGHT_UP)
		return { turn: swivel, catchingUp: false };
	return { turn: dragged + rest, catchingUp: true };
}

/**
 * The attitude the phone is held in when tilted by `tilt` from the level pose held in `pose`;
 * undoes wholeTilt. The bench, the pilot and the scripted sensor build their samples with it.
 */
export function attitudeAt(tilt: TiltAngles, pose: Attitude): Attitude {
	"worklet";
	return turnedBy(pose, { x: tilt.y, y: tilt.x, z: 0 });
}
