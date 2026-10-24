import type { Gravity, MotionSample, TiltAngles } from "./types";
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
const FLAT_DOWNHILL: Gravity = { x: 0, y: -1, z: 0 };

/** The level pose, and what tilt reads from it */
export interface LevelPose {
	/** Gravity at the pose, unit */
	gravity: Gravity;
	/** The direction on the screen that lies level at the pose, unit */
	across: Gravity;
	/** The direction on the screen square to across, unit; downhill, unless held flat */
	downhill: Gravity;
	/** How much the swivel steers, 0 to 1, by how upright the pose stands */
	swivelWeight: number;
	/** How far gravity's share of a roll about downhill is scaled back */
	gravityGain: number;
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

function smoothstep(from: number, to: number, value: number): number {
	const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
	return t * t * (3 - 2 * t);
}

/** The level pose held where gravity reads `gravity` */
export function levelPoseAt(gravity: Gravity): LevelPose {
	const down = unit(gravity);
	const onScreen = { x: down.x, y: down.y, z: 0 };
	const downhill = lengthOf(onScreen) > 1e-6 ? unit(onScreen) : FLAT_DOWNHILL;
	const upright = uprightness(down);
	return {
		gravity: down,
		across: cross(downhill, { x: 0, y: 0, z: 1 }),
		downhill,
		swivelWeight: smoothstep(SWIVEL_FROM, SWIVEL_FULL, upright),
		gravityGain: Math.min(MOST_GRAVITY_GAIN, 1 / Math.cos(upright) ** 2),
	};
}

/** What tilt carries from one sample to the next */
export interface TiltState {
	pose: LevelPose;
	/** The latest gravity, unit; null before the first sample */
	gravity: Gravity | null;
	/** The swivel since the level pose (radians), anticlockwise seen from above */
	swivel: number;
	/** The latest sample's time (ms); null before the first */
	timeMs: number | null;
}

export const TILT_START: TiltState = {
	pose: levelPoseAt(FLAT_GRAVITY),
	gravity: null,
	swivel: 0,
	timeMs: null,
};

/** Tilt after one more sample */
export function stepTilt(state: TiltState, sample: MotionSample): TiltState {
	const gravity = unit(sample.gravity);
	const dtMs = state.timeMs === null ? 0 : sample.timeMs - state.timeMs;
	// A sample read at the same moment again (Android resends the last) says nothing new
	if (state.timeMs !== null && dtMs === 0) return state;
	const turned = dtMs > 0 && dtMs <= LONGEST_GAP_MS ? (swivelRate(sample) * dtMs) / 1000 : 0;
	return { ...state, gravity, swivel: state.swivel + turned, timeMs: sample.timeMs };
}

/** Tilt with its level pose taken where the phone is now held; before any sample, flat */
export function takeLevelPose(state: TiltState): TiltState {
	const pose = levelPoseAt(state.gravity ?? FLAT_GRAVITY);
	return { ...state, pose, swivel: 0 };
}

/**
 * The tilt (radians): `x` how far the phone has turned about its long axis (right edge away from
 * the eyes), `y` about its short axis (top edge towards them)
 */
export function tiltOf(state: TiltState): TiltAngles {
	const { pose, gravity } = state;
	if (!gravity) return { x: 0, y: 0 };
	// The phone turns the other way to gravity in its own axes
	const seen = turnBetween(gravity, pose.gravity);
	const aboutDownhill = dot(seen, pose.downhill);
	const up = scaled(pose.gravity, -1);
	const whole = aboutDownhill + state.swivel * dot(up, pose.downhill);
	const w = pose.swivelWeight;
	const downhill = (1 - w) * pose.gravityGain * aboutDownhill + w * whole;
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

/** Below this tilt (radians, 1 degree) the dot rests */
const DEAD_ZONE = Math.PI / 180;

/** From this tilt (radians, 3 degrees) the dot moves as fast as the tilt says */
const FULL_FROM = (3 * Math.PI) / 180;

/** Past this tilt (radians, 20 degrees) the dot moves no faster */
const TOP_TILT = (20 * Math.PI) / 180;

/**
 * The tilt the dot moves by: none inside the dead zone, easing in up to FULL_FROM, as it is from
 * there, and no more than TOP_TILT in any direction, so a diagonal is no faster than straight
 */
export function shapeTilt(tilt: TiltAngles): TiltAngles {
	const size = Math.hypot(tilt.x, tilt.y);
	if (size <= DEAD_ZONE) return { x: 0, y: 0 };
	const shaped = Math.min(TOP_TILT, size * smoothstep(DEAD_ZONE, FULL_FROM, size));
	return { x: (tilt.x * shaped) / size, y: (tilt.y * shaped) / size };
}
