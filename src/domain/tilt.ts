import { smoothstep } from "./smoothstep";
import type { Gravity, MotionSample, TiltAngles, Vector3 } from "./types";
import { cross, dot, lengthOf, plus, rotated, scaled, turnBetween, unit } from "./vector3";

/**
 * Tilt: how far the hand has turned the phone from the level pose, about the screen's own long
 * and short axes (ADR 0016, ADR 0017).
 *
 * The level pose is taken afresh, in whatever grip the player holds, when a run starts and when
 * Get ready ends. Gravity sees every turn of the phone but one, the turn about the vertical: the
 * swivel. Held flat or leaning, that is the player turning on the spot, and tilt is gravity's
 * turn alone, its share of a roll scaled back to the whole roll. Held upright, a roll about the
 * screen's upright axis is nothing but a swivel, so there the swivel the gyroscope measures
 * steers too, a turn on the spot included: the two are the same turn there.
 *
 * The turn is split along two directions on the screen: across, which lies level at the level
 * pose, and downhill, square to it. A turn about across moves gravity in full. A turn about
 * downhill is partly a swivel, by as much as downhill stands from level: none of it flat, all
 * of it upright.
 */

/** From how far the level pose stands from flat (radians) the swivel starts to steer */
const SWIVEL_FROM = (60 * Math.PI) / 180;

/** From how far the level pose stands from flat (radians) the swivel steers in full */
const SWIVEL_FULL = (80 * Math.PI) / 180;

/**
 * How far gravity's share of a roll about downhill is scaled back, at most: as at 60 degrees
 * from flat, where the swivel takes over. Scaling it further would blow sensor jitter up.
 */
const MOST_GRAVITY_GAIN = 1 / Math.cos(SWIVEL_FROM) ** 2;

/** A gap in the samples longer than this (ms) adds no swivel, as after a pause */
const LONGEST_GAP_MS = 200;

/** Lying flat, face up: gravity straight out of the back of the screen */
export const FLAT_GRAVITY: Gravity = { x: 0, y: 0, z: -1 };

/** The screen's own downhill when lying flat, where gravity names none: towards its foot */
const FLAT_DOWNHILL: Vector3 = { x: 0, y: -1, z: 0 };

/**
 * The level pose, and what tilt reads from it. The turn about across is gravity's in full; the
 * turn about downhill mixes gravity's share of it with the swivel, by how upright the pose
 * stands, so the mix is worked out once here as two gains.
 */
export interface LevelPose {
	/** Gravity at the pose, unit */
	gravity: Gravity;
	/** The direction on the screen that lies level at the pose, unit */
	across: Vector3;
	/** The direction on the screen square to across, unit; downhill, unless held flat */
	downhill: Vector3;
	/**
	 * How much gravity's turn about downhill steers: scaled back to the whole roll reclined, up
	 * to MOST_GRAVITY_GAIN, and handing over to the swivel at 1 upright
	 */
	rollGain: number;
	/**
	 * How much the swivel steers about downhill: none below SWIVEL_FROM, then more and more of
	 * its share of a roll there, how far downhill stands from level
	 */
	swivelGain: number;
}

/** How fast the phone turns about the vertical (radians a second), anticlockwise seen from above */
export function swivelRate(sample: MotionSample): number {
	return -dot(sample.rotationRate, unit(sample.gravity));
}

/** How far the screen stands from lying flat (radians): 0 flat, face up or down, pi/2 upright */
export function uprightness(gravity: Gravity): number {
	const down = unit(gravity);
	if (lengthOf(down) === 0) return 0;
	return Math.acos(Math.min(1, Math.abs(down.z)));
}

/** The level pose held where gravity reads `gravity` */
export function levelPoseAt(gravity: Gravity): LevelPose {
	const down = unit(gravity);
	const onScreen = { x: down.x, y: down.y, z: 0 };
	const downhill = lengthOf(onScreen) > 1e-6 ? unit(onScreen) : FLAT_DOWNHILL;
	const upright = uprightness(down);
	const swivelWeight = smoothstep(SWIVEL_FROM, SWIVEL_FULL, upright);
	const gravityGain = Math.min(MOST_GRAVITY_GAIN, 1 / Math.cos(upright) ** 2);
	return {
		gravity: down,
		across: cross(downhill, { x: 0, y: 0, z: 1 }),
		downhill,
		rollGain: (1 - swivelWeight) * gravityGain + swivelWeight,
		// Up the screen is against gravity, so the swivel's share is up's along downhill
		swivelGain: swivelWeight * -dot(down, downhill),
	};
}

/** What tilt carries from one sample to the next */
export interface TiltState {
	pose: LevelPose;
	/** The latest gravity, unit; flat before the first sample, so the tilt reads none */
	gravity: Gravity;
	/** The swivel since the level pose (radians), anticlockwise seen from above */
	swivel: number;
	/** The latest sample's time (ms); null before the first */
	timeMs: number | null;
}

export const TILT_START: TiltState = {
	pose: levelPoseAt(FLAT_GRAVITY),
	gravity: FLAT_GRAVITY,
	swivel: 0,
	timeMs: null,
};

/** Tilt after one more sample */
export function stepTilt(state: TiltState, sample: MotionSample): TiltState {
	const dtMs = state.timeMs === null ? Number.POSITIVE_INFINITY : sample.timeMs - state.timeMs;
	// A sample read at the same moment again (Android resends the last) says nothing new
	if (dtMs === 0) return state;
	const turned = dtMs > 0 && dtMs <= LONGEST_GAP_MS ? (swivelRate(sample) * dtMs) / 1000 : 0;
	return {
		...state,
		gravity: unit(sample.gravity),
		swivel: state.swivel + turned,
		timeMs: sample.timeMs,
	};
}

/** Tilt with its level pose taken where the phone is held now; before any sample, flat */
export function takeLevelPose(state: TiltState): TiltState {
	return { ...state, pose: levelPoseAt(state.gravity), swivel: 0 };
}

/**
 * The tilt (radians): `x` how far the phone has turned about its long axis (right edge away from
 * the eyes), `y` about its short axis (top edge towards them)
 */
export function tiltOf({ pose, gravity, swivel }: TiltState): TiltAngles {
	// The phone turns the other way to gravity in its own axes
	const seen = turnBetween(gravity, pose.gravity);
	const downhill = pose.rollGain * dot(seen, pose.downhill) + pose.swivelGain * swivel;
	const turn = plus(scaled(pose.across, dot(seen, pose.across)), scaled(pose.downhill, downhill));
	return { x: turn.y, y: turn.x };
}

/**
 * The gravity the phone reads held where gravity reads `pose`, then turned by `tilt` about its
 * own long and short axes. The bench, the pilot and the scripted sensor build their samples
 * with it.
 */
export function gravityAt(tilt: TiltAngles, pose: Gravity): Gravity {
	// The phone's turn, axes swapped as in tiltOf; gravity turns the other way in its axes
	return rotated(pose, { x: -tilt.y, y: -tilt.x, z: 0 });
}
