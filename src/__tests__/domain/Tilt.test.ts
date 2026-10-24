import { describe, expect, it } from "vitest";
import {
	FLAT_GRAVITY,
	gravityAt,
	shapeTilt,
	stepTilt,
	TILT_START,
	type TiltState,
	takeLevelPose,
	tiltOf,
} from "../../domain/tilt";
import type { Gravity, MotionSample } from "../../domain/types";
import { trace } from "../fixtures/motion/traces";

const DEG = Math.PI / 180;
const STILL = { x: 0, y: 0, z: 0 };
const SAMPLE_MS = 10;

/** Gravity held reclined `degrees` from flat, in portrait, screen up */
const reclined = (degrees: number): Gravity => gravityAt({ x: 0, y: degrees * DEG }, FLAT_GRAVITY);
const UPRIGHT = reclined(90);
/** Lying on your right side, the phone in portrait before your eyes: gravity along its left */
const ON_THE_SIDE: Gravity = { x: -1, y: 0, z: 0 };
/** Lying back with the phone overhead, screen down */
const OVERHEAD: Gravity = { x: 0, y: 0, z: 1 };

/** Tilt with its level pose taken holding `pose` still for a moment */
function posedAt(pose: Gravity): TiltState {
	let state = TILT_START;
	for (let t = 0; t <= 100; t += SAMPLE_MS) {
		state = stepTilt(state, { gravity: pose, rotationRate: STILL, acceleration: STILL, timeMs: t });
	}
	return takeLevelPose(state);
}

/**
 * Tilt after the hand turns the phone from `pose` by `angle` about its long axis ("x", right edge
 * away from the eyes) or its short axis ("y", top edge towards them), steadily over `ms`, then
 * holds it there for a moment, the gyroscope reporting the turn as it goes
 */
function turned(state: TiltState, pose: Gravity, axis: "x" | "y", angle: number, ms = 400) {
	let next = state;
	const start = (state.timeMs ?? 0) + SAMPLE_MS;
	const rate = (angle * 1000) / ms;
	for (let t = 0; t <= ms + 200; t += SAMPLE_MS) {
		const done = Math.min(1, t / ms);
		const turning = t < ms ? rate : 0;
		const sample: MotionSample = {
			gravity: gravityAt(
				axis === "x" ? { x: angle * done, y: 0 } : { x: 0, y: angle * done },
				pose,
			),
			// About the long axis is a turn about the phone's y; about the short axis, its x
			rotationRate: axis === "x" ? { x: 0, y: turning, z: 0 } : { x: turning, y: 0, z: 0 },
			acceleration: STILL,
			timeMs: start + t,
		};
		next = stepTilt(next, sample);
	}
	return next;
}

describe("tilt", () => {
	it("reads nothing at the level pose, in any grip", () => {
		for (const pose of [FLAT_GRAVITY, reclined(45), UPRIGHT, ON_THE_SIDE, OVERHEAD]) {
			const tilt = tiltOf(posedAt(pose));
			expect(tilt.x).toBeCloseTo(0);
			expect(tilt.y).toBeCloseTo(0);
		}
	});

	it("reads a roll and a tip in full held flat", () => {
		const flat = posedAt(FLAT_GRAVITY);
		expect(tiltOf(turned(flat, FLAT_GRAVITY, "x", 10 * DEG)).x).toBeCloseTo(10 * DEG, 3);
		expect(tiltOf(turned(flat, FLAT_GRAVITY, "y", 10 * DEG)).y).toBeCloseTo(10 * DEG, 3);
	});

	it("reads a roll in full reclined, gravity's share scaled back", () => {
		const pose = reclined(45);
		const tilt = tiltOf(turned(posedAt(pose), pose, "x", 10 * DEG));
		expect(tilt.x).toBeCloseTo(10 * DEG, 2);
		// Gravity follows a cone, not a great circle, so a roll reads a little as a tip
		expect(Math.abs(tilt.y)).toBeLessThan(0.5 * DEG);
	});

	it("reads a roll upright from the swivel, which gravity cannot see", () => {
		const tilt = tiltOf(turned(posedAt(UPRIGHT), UPRIGHT, "x", 10 * DEG));
		expect(tilt.x).toBeCloseTo(10 * DEG, 2);
		expect(tilt.y).toBeCloseTo(0, 2);
	});

	it("keeps a roll upright for as long as it is held", () => {
		const rolled = turned(posedAt(UPRIGHT), UPRIGHT, "x", 10 * DEG);
		let held = rolled;
		const rolledGravity = gravityAt({ x: 10 * DEG, y: 0 }, UPRIGHT);
		for (let t = 1; t <= 300; t++) {
			held = stepTilt(held, {
				gravity: rolledGravity,
				rotationRate: STILL,
				acceleration: STILL,
				timeMs: (rolled.timeMs ?? 0) + t * SAMPLE_MS,
			});
		}
		expect(tiltOf(held).x).toBeCloseTo(10 * DEG, 2);
	});

	it("reads a tip lying on your side from the swivel, the same rule turned", () => {
		const tilt = tiltOf(turned(posedAt(ON_THE_SIDE), ON_THE_SIDE, "y", 10 * DEG));
		expect(tilt.y).toBeCloseTo(10 * DEG, 2);
		expect(tilt.x).toBeCloseTo(0, 2);
	});

	it("reads screen down the way the hand turns, as screen up", () => {
		const tilt = tiltOf(turned(posedAt(OVERHEAD), OVERHEAD, "x", 10 * DEG));
		expect(tilt.x).toBeCloseTo(10 * DEG, 3);
	});

	it("ignores a flat spin, which is the player turning on the spot", () => {
		let state = posedAt(reclined(30));
		for (let t = 1; t <= 100; t++) {
			state = stepTilt(state, {
				gravity: reclined(30),
				rotationRate: { x: 0, y: 1, z: 1 },
				acceleration: STILL,
				timeMs: 100 + t * SAMPLE_MS,
			});
		}
		// Reclined 30 degrees the swivel steers nothing, whichever axis it turns about
		expect(Math.hypot(tiltOf(state).x, tiltOf(state).y)).toBeLessThan(1e-6);
	});

	it("starts over from wherever the phone is held when the level pose is taken again", () => {
		const rolled = turned(posedAt(UPRIGHT), UPRIGHT, "x", 15 * DEG);
		const again = takeLevelPose(rolled);
		expect(tiltOf(again).x).toBeCloseTo(0);
		expect(tiltOf(again).y).toBeCloseTo(0);
	});

	it("never steers for a torso turn upright, and does for a wrist roll, on a real phone", () => {
		// iPhone held upright on a sofa: held still to 5 s, six torso turns of about 80 degrees
		// to 18 s, then six wrist rolls
		let state = TILT_START;
		let turnMost = 0;
		let rollMost = 0;
		for (const sample of trace("ios-upright-turns-and-rolls.json")) {
			state = stepTilt(state, sample);
			if (sample.timeMs < 5000) {
				state = takeLevelPose(state);
				continue;
			}
			const steer = Math.abs(tiltOf(state).x);
			if (sample.timeMs < 18_000) turnMost = Math.max(turnMost, steer);
			else rollMost = Math.max(rollMost, steer);
		}
		// Read 3.7 degrees at most through the turns, and 47 through the rolls
		expect(turnMost).toBeLessThan(5 * DEG);
		expect(rollMost).toBeGreaterThan(30 * DEG);
	});
});

describe("shapeTilt", () => {
	it("rests inside the dead zone", () => {
		expect(shapeTilt({ x: 0.9 * DEG, y: 0 })).toEqual({ x: 0, y: 0 });
	});

	it("eases in from the dead zone, then moves as the tilt says", () => {
		const easing = shapeTilt({ x: 2 * DEG, y: 0 }).x;
		expect(easing).toBeGreaterThan(0);
		expect(easing).toBeLessThan(2 * DEG);
		expect(shapeTilt({ x: 10 * DEG, y: 0 }).x).toBeCloseTo(10 * DEG);
		expect(shapeTilt({ x: -10 * DEG, y: 0 }).x).toBeCloseTo(-10 * DEG);
	});

	it("goes no faster past the top tilt, diagonals included", () => {
		expect(shapeTilt({ x: 0, y: 40 * DEG }).y).toBeCloseTo(20 * DEG);
		const diagonal = shapeTilt({ x: 30 * DEG, y: 30 * DEG });
		expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(20 * DEG);
	});
});
