import type { Gravity, PoseSide, SavedLevelPoses, TiltAngles } from "./types";

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

/** The two level poses, as the gravity each reads, at unit length */
export type LevelPoses = Readonly<Record<PoseSide, Gravity>>;

/**
 * How much nearer the other level pose must be before it takes over (60 degrees). Between flat
 * poses this switches 30 degrees past upright, so holding the phone near upright doesn't flip
 * between them.
 */
const TURN_OVER_MARGIN = Math.PI / 3;

/**
 * How far past upright a level pose may lie and still belong to the side it was set on (sine of
 * 30 degrees, half TURN_OVER_MARGIN, as far past upright as the flat poses hand over). Nearer
 * upright than this, gravity can't tell which side the player came from; further, it can.
 */
const UPRIGHT_BAND = Math.sin(TURN_OVER_MARGIN / 2);

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

/**
 * Which way round a roll reads on each side, against the way it turns gravity: screen down,
 * gravity sees the hand's turn mirrored
 */
const SENSE: Readonly<Record<PoseSide, number>> = { up: 1, down: -1 };

/** Turned right over from the level pose, no turn is shortest: a half turn about the short axis */
const HALF_TURN: TiltAngles = { x: 0, y: Math.PI };

// Three-vector arithmetic. A gravity, a direction on the screen and a turn as an axis scaled by
// its angle are all one of these, in the phone's own axes.

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

/** `v` turned by `turn`, an axis scaled by its angle, right-handed (Rodrigues) */
function rotated(v: Vector, turn: Vector): Vector {
	"worklet";
	const angle = lengthOf(turn);
	if (angle < NO_TURN) return v;
	const axis = scaled(turn, 1 / angle);
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
 * The shortest turn taking direction `from` to `to`, as an axis scaled by its angle; none when
 * they already agree, and null when they point straight apart, where no turn is shortest
 */
function directionTurn(from: Vector, to: Vector): Vector | null {
	"worklet";
	const axis = cross(from, to);
	const sine = lengthOf(axis);
	const cosine = dot(from, to);
	if (sine > NO_TURN * lengthOf(from) * lengthOf(to)) {
		return scaled(axis, Math.atan2(sine, cosine) / sine);
	}
	return cosine > 0 ? { x: 0, y: 0, z: 0 } : null;
}

/**
 * A turn of the phone about its own long and short axes, as tilt reads it: about the long axis
 * is x, about the short axis is y. The same swap takes a tilt back to a turn.
 */
function tiltOfTurn(turn: Vector): TiltAngles {
	"worklet";
	return { x: turn.y, y: turn.x };
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

/**
 * The level poses before any is set: flat on a table, and flat overhead, turned over about the
 * phone's short axis as lying back turns it
 */
export const FLAT: LevelPoses = {
	up: { x: 0, y: 0, z: -1 },
	down: { x: 0, y: 0, z: 1 },
};

/** Whether the pose reading `pose` (unit) lies on `side`, or within UPRIGHT_BAND past upright */
function liesOn(pose: Gravity, side: PoseSide): boolean {
	"worklet";
	return SENSE[side] * pose.z <= UPRIGHT_BAND;
}

/**
 * The side a level pose reading `pose` belongs on, set while the pose on `inUse` was in use: the
 * side its screen faces, or near upright, where gravity can't tell, the side in use. The side in
 * use alone can't say: it holds until the other pose is nearer by TURN_OVER_MARGIN, so between
 * two saved poses it can outlast the screen turning over, and a pose set flat while the
 * screen-down one was in use would read every roll backwards.
 */
export function poseSide(pose: Gravity, inUse: PoseSide): PoseSide {
	"worklet";
	if (liesOn(unitGravity(pose), inUse)) return inUse;
	return inUse === "up" ? "down" : "up";
}

/**
 * The level poses to measure from: each saved one at unit length, and flat where none is set or
 * where one lies on the other side, as builds before poseSide could save them
 */
export function levelPosesOf(saved: SavedLevelPoses): LevelPoses {
	return { up: savedPose(saved, "up"), down: savedPose(saved, "down") };
}

/** The saved pose on `side` at unit length, or flat on `side` if it is unset or doesn't lie there */
function savedPose(saved: SavedLevelPoses, side: PoseSide): Gravity {
	const pose = saved[side];
	if (!pose) return FLAT[side];
	const unit = unitGravity(pose);
	return liesOn(unit, side) ? unit : FLAT[side];
}

/**
 * Which level pose is in use for the phone reading `gravity`: the one in use at the last
 * sample, `was`, stays until the other is nearer by TURN_OVER_MARGIN
 */
function sideInUse(gravity: Gravity, poses: LevelPoses, was: PoseSide): PoseSide {
	const fromUp = angleBetween(gravity, poses.up);
	const fromDown = angleBetween(gravity, poses.down);
	const turnOver =
		was === "down" ? fromUp + TURN_OVER_MARGIN >= fromDown : fromDown + TURN_OVER_MARGIN < fromUp;
	return turnOver ? "down" : "up";
}

/**
 * How much a roll about the downhill direction is scaled, for a pose where gravity sees `seen`
 * (cos of how far it is reclined from flat) of it: back to the whole roll up to WHEEL_FROM, and
 * from there easing to 1 upright, where the same movement of gravity is the steering wheel
 */
function rollGain(seen: number): number {
	"worklet";
	if (seen >= WHEEL_FROM) return 1 / seen;
	return 1 + (1 / WHEEL_FROM - 1) * (seen / WHEEL_FROM);
}

/**
 * Tilt of the phone reading `gravity`, from the level pose on `side` that reads `pose` (unit),
 * along the phone's own long and short axes. A turn about the vertical never moves gravity, so
 * the player turning on the spot reads as nothing in every pose.
 *
 * Gravity's turn from the pose splits along two directions on the screen. Tipping about the one
 * that lies level at the pose (the short axis, held reclined) moves gravity in full and reads as
 * it is. Rolling about the other, which points downhill on the screen at the pose, moves gravity
 * by only its share of the roll, and so does turning the screen like a steering wheel, by the
 * rest: both turn gravity about the screen's axis as it lies square to gravity. That movement
 * is read as a roll scaled by rollGain, so reclined it is the whole roll and upright it is the
 * wheel in full: turned clockwise it lowers the right edge, as the roll it stands in for does
 * reclined. Flat there is no lost axis and every tip reads as gravity sees it.
 *
 * The axes are the phone's own, so screen down a turn that tips an edge away from the eyes
 * reads the way it does screen up: SENSE keeps a roll and the wheel the hand's way round on
 * each side, the same either side of the vertical, so a pose saved past upright reads as one
 * just short of it. That holds while the pose lies on `side` (see poseSide and levelPosesOf):
 * a pose on the other side would read every roll backwards.
 */
export function gravityTilt(gravity: Gravity, pose: Gravity, side: PoseSide): TiltAngles {
	"worklet";
	// The phone's turn from the pose to now: gravity turns one way in the phone's axes as the
	// phone turns the other
	const turn = directionTurn(gravity, pose);
	if (!turn) return HALF_TURN;
	const lean = Math.hypot(pose.x, pose.y);
	if (lean < FLAT_ENOUGH) return tiltOfTurn(turn);
	// Downhill on the screen at the pose, and the screen's direction that lies level there
	const downhill = { x: pose.x / lean, y: pose.y / lean, z: 0 };
	const across = { x: -downhill.y, y: downhill.x, z: 0 };
	// The screen's axis, square to gravity: what a roll and the wheel both turn gravity about
	const screenAxis = { x: -pose.z * downhill.x, y: -pose.z * downhill.y, z: lean };
	const tip = dot(turn, across);
	const roll = SENSE[side] * dot(turn, screenAxis) * rollGain(Math.abs(pose.z));
	return tiltOfTurn({
		x: across.x * tip + downhill.x * roll,
		y: across.y * tip + downhill.y * roll,
		z: 0,
	});
}

/**
 * The gravity `share` (0..1) of the way from `from` to `to`, along the shortest turn. Each step
 * is a real turn, so a running mean or a smoothing built from it stays a direction gravity can
 * point, where averaging the components would shrink it. Straight apart, it jumps to `to`.
 */
export function turnedToward(from: Gravity, to: Gravity, share: number): Gravity {
	"worklet";
	const turn = share >= 1 ? null : directionTurn(from, to);
	return turn ? rotated(from, scaled(turn, share)) : to;
}

/** The level tilt and the level pose it was measured from */
export interface LevelTilt extends TiltAngles {
	side: PoseSide;
}

/**
 * Tilt of the phone reading `gravity`, from whichever of the level `poses` is in use, given the
 * one in use at the last reading, `was`. Which one is decided with TURN_OVER_MARGIN.
 */
export function levelTilt(gravity: Gravity, poses: LevelPoses, was: PoseSide): LevelTilt {
	const side = sideInUse(gravity, poses, was);
	const tilt = gravityTilt(gravity, poses[side], side);
	return { x: tilt.x, y: tilt.y, side };
}

/**
 * The gravity the phone reads held at the level pose reading `pose`, then turned by `tilt`
 * about its own long and short axes. From a flat pose that undoes gravityTilt; the bench, the
 * pilot and the scripted sensor build their samples with it.
 */
export function gravityAt(tilt: TiltAngles, pose: Gravity): Gravity {
	"worklet";
	// The phone's turn, axes swapped as in tiltOfTurn; gravity turns the other way in its axes
	return rotated(pose, { x: -tilt.y, y: -tilt.x, z: 0 });
}
