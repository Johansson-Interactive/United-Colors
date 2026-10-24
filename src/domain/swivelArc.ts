import type { Gravity, MotionSample, Vector3 } from "./types";

/**
 * Telling a swivel the wrist makes from a turn on the spot (ADR 0016). Both turn the phone about
 * the vertical, but turning on the spot swings it along a circle about the body, a few tenths of
 * a metre across, while a wrist roll spins it about itself. The swing shows in the acceleration
 * the hand gives the phone: a turn about the vertical at radius r, rate w and angular
 * acceleration a pushes the phone sideways by r * w^2 towards the axis and r * a along the
 * circle. So the radius of a swivel is the level acceleration it comes with, against
 * sqrt(w^4 + a^2).
 *
 * The gauge follows the swivel sample by sample and sums each swivel, from the moment it turns
 * faster than SWIVEL_RATE until it has been slower for QUIET_MS, into a least-squares fit of
 * that radius, weighted by time so the sample rate doesn't count. Play can't wait for a swivel
 * to end, so the fit is also read as it goes: once it has LEAST_EVIDENCE behind it and reaches
 * BODY_ARC, the swivel is a turn on the spot from then on.
 *
 * A hand never holds a phone quite still: held upright on a sofa it pushes it about by 0.1 to
 * 0.3 m/s^2 with no swivel at all, which against the small lever early in a swivel reads as a
 * wide arc. So the push the hand gives between swivels is followed too, and only what a swivel
 * pushes beyond it counts.
 */

/** How fast the phone must turn about the vertical to count as swivelling (radians a second) */
const SWIVEL_RATE = 0.35;

/** How long a swivel must stay slower than SWIVEL_RATE to be over (ms) */
const QUIET_MS = 250;

/** How long the swivel rate takes to close all but a third of a change (ms), against jitter */
const RATE_SMOOTHING_MS = 40;

/** A swivel smaller than this (radians, about 5 degrees) is hand shake, not a gesture */
const LEAST_TURN = (5 * Math.PI) / 180;

/** A gap in the samples longer than this (ms) starts the gauge over, as after a pause */
const LONGEST_GAP_MS = 200;

/**
 * The radius (metres) that marks a turn on the spot, as the fit reads it while a swivel goes on.
 * Recorded on an iPhone held upright on a sofa (fixtures/motion), wrist rolls never read more
 * than 7.2 cm at any point, and torso turns read 18 to 30 cm within 30 ms of starting, from the
 * swing of the body getting under way; 11 cm is the middle of that gap, by ratio.
 */
const BODY_ARC = 0.11;

/**
 * How much of the radius's lever the fit needs behind it (the time integral of its square)
 * before it is read as it goes: the lever at 1 for 200 ms. Before that, a few samples of hand
 * shake against a barely moving phone could read as any radius.
 */
const LEAST_EVIDENCE = 0.2;

/** How long the resting push takes to close all but a third of a change (ms) */
const RESTING_PUSH_MS = 500;

/** When a swivel was first read as a turn on the spot, as it went */
interface Decision {
	/** How long after the swivel began (ms) */
	afterMs: number;
	/** How far it had turned by then (radians, unsigned) */
	afterTurn: number;
}

/** One swivel from start to end, as the gauge measured it */
export interface Swivel {
	/** How far it turned about the vertical (radians), anticlockwise seen from above */
	turned: number;
	/** Its fastest turn (radians a second) */
	peakRate: number;
	/** The circle it swung the phone along (metres); null when it turned too gently to tell */
	radius: number | null;
	durationMs: number;
	/** When it last turned fast enough to count (ms, on the samples' clock) */
	endMs: number;
	/** When it was first read as a turn on the spot; null if it never was */
	decided: Decision | null;
}

/** The swivel under way: its sums so far */
interface Sums {
	turned: number;
	peakRate: number;
	/** Time integral of level acceleration times the radius's lever, sqrt(w^4 + a^2) */
	pushTimesLever: number;
	/** Time integral of the lever squared */
	leverSquared: number;
	decided: Decision | null;
	startMs: number;
	/** When it last turned faster than SWIVEL_RATE */
	lastFastMs: number;
}

/** What the gauge carries from one sample to the next */
export interface ArcGauge {
	/** The last sample's time; null before the first */
	timeMs: number | null;
	/** The swivel rate, smoothed (radians a second) */
	rate: number;
	/** The level push the hand gives between swivels, smoothed (metres a second squared) */
	restingPush: number;
	current: Sums | null;
}

export const ARC_GAUGE_START: ArcGauge = { timeMs: null, rate: 0, restingPush: 0, current: null };

function dot(a: Vector3, b: Vector3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: Vector3): number {
	return Math.sqrt(dot(v, v));
}

/** How fast the phone turns about the vertical (radians a second), anticlockwise seen from above */
export function swivelRate(sample: MotionSample): number {
	const g = sample.gravity;
	const gLength = length(g);
	if (gLength === 0) return 0;
	return -dot(sample.rotationRate, g) / gLength;
}

/** How hard the hand pushes the phone level, along the floor (metres a second squared) */
export function levelAcceleration(sample: MotionSample): number {
	const g = sample.gravity;
	const a = sample.acceleration;
	const gSquared = dot(g, g);
	if (gSquared === 0) return length(a);
	const along = dot(a, g) / gSquared;
	return length({ x: a.x - along * g.x, y: a.y - along * g.y, z: a.z - along * g.z });
}

/** How far the screen stands from lying flat (radians): 0 flat, face up or down, pi/2 upright */
export function uprightness(gravity: Gravity): number {
	const gLength = length(gravity);
	if (gLength === 0) return 0;
	return Math.acos(Math.min(1, Math.abs(gravity.z) / gLength));
}

function radiusOf(sums: Sums): number | null {
	return sums.leverSquared > 0 ? sums.pushTimesLever / sums.leverSquared : null;
}

function ended(sums: Sums): Swivel | null {
	if (Math.abs(sums.turned) < LEAST_TURN) return null;
	return {
		turned: sums.turned,
		peakRate: sums.peakRate,
		radius: radiusOf(sums),
		durationMs: sums.lastFastMs - sums.startMs,
		endMs: sums.lastFastMs,
		decided: sums.decided,
	};
}

/** Whether the swivel under way reads as a turn on the spot, as far as it has gone */
export function isTurnOnTheSpot(gauge: ArcGauge): boolean {
	return gauge.current?.decided != null;
}

/** The decision on a swivel so far: kept once made, else made now if the fit says so */
function decide(sums: Sums, nowMs: number): Decision | null {
	if (sums.decided) return sums.decided;
	const radius = radiusOf(sums);
	if (sums.leverSquared < LEAST_EVIDENCE || radius === null || radius < BODY_ARC) return null;
	return { afterMs: nowMs - sums.startMs, afterTurn: Math.abs(sums.turned) };
}

/** The gauge after one more sample, and the swivel that sample ended, if any */
export function stepArcGauge(
	gauge: ArcGauge,
	sample: MotionSample,
): { gauge: ArcGauge; ended: Swivel | null } {
	const raw = swivelRate(sample);
	const dtMs = gauge.timeMs === null ? 0 : sample.timeMs - gauge.timeMs;
	// A sample read at the same moment again (Android resends the last) says nothing new
	if (gauge.timeMs !== null && dtMs === 0) return { gauge, ended: null };
	if (gauge.timeMs === null || dtMs < 0 || dtMs > LONGEST_GAP_MS) {
		const restarted: ArcGauge = {
			timeMs: sample.timeMs,
			rate: raw,
			restingPush: gauge.restingPush,
			current: null,
		};
		return { gauge: restarted, ended: gauge.current ? ended(gauge.current) : null };
	}

	const rate = gauge.rate + (raw - gauge.rate) * (1 - Math.exp(-dtMs / RATE_SMOOTHING_MS));
	const angularAcceleration = ((rate - gauge.rate) * 1000) / dtMs;
	const fast = Math.abs(rate) >= SWIVEL_RATE;
	const push = levelAcceleration(sample);

	let current = gauge.current;
	if (!current && fast) {
		current = {
			turned: 0,
			peakRate: 0,
			pushTimesLever: 0,
			leverSquared: 0,
			decided: null,
			startMs: sample.timeMs,
			lastFastMs: sample.timeMs,
		};
	}
	if (!current) {
		const resting = gauge.restingPush;
		const restingPush = resting + (push - resting) * (1 - Math.exp(-dtMs / RESTING_PUSH_MS));
		return { gauge: { timeMs: sample.timeMs, rate, restingPush, current: null }, ended: null };
	}

	const { restingPush } = gauge;
	if (!fast && sample.timeMs - current.lastFastMs >= QUIET_MS) {
		return {
			gauge: { timeMs: sample.timeMs, rate, restingPush, current: null },
			ended: ended(current),
		};
	}

	const dt = dtMs / 1000;
	const lever = Math.sqrt(rate ** 4 + angularAcceleration ** 2);
	const summed: Sums = {
		turned: current.turned + rate * dt,
		peakRate: Math.max(current.peakRate, Math.abs(rate)),
		pushTimesLever: current.pushTimesLever + Math.max(0, push - restingPush) * lever * dt,
		leverSquared: current.leverSquared + lever * lever * dt,
		decided: current.decided,
		startMs: current.startMs,
		lastFastMs: fast ? sample.timeMs : current.lastFastMs,
	};
	const next = { ...summed, decided: decide(summed, sample.timeMs) };
	return { gauge: { timeMs: sample.timeMs, rate, restingPush, current: next }, ended: null };
}
