import { describe, expect, it } from "vitest";
import {
	ARC_GAUGE_START,
	isTurnOnTheSpot,
	levelAcceleration,
	type Swivel,
	stepArcGauge,
	swivelRate,
	uprightness,
} from "../../domain/swivelArc";
import type { Gravity, MotionSample } from "../../domain/types";
import { trace } from "../fixtures/motion/traces";

const DEG = Math.PI / 180;
const STILL = { x: 0, y: 0, z: 0 };
/** Held upright in portrait: gravity runs down the screen */
const UPRIGHT: Gravity = { x: 0, y: -1, z: 0 };
const FLAT: Gravity = { x: 0, y: 0, z: -1 };

function sample(partial: Partial<MotionSample>): MotionSample {
	return { gravity: FLAT, rotationRate: STILL, acceleration: STILL, timeMs: 0, ...partial };
}

/**
 * Upright, the phone turned a quarter turn about the vertical (its long axis) in `seconds`,
 * at `radius` from the axis, then held still; at 100 Hz like Core Motion
 */
function quarterTurn(radius: number, seconds = 0.8): MotionSample[] {
	const samples: MotionSample[] = [];
	const angle = Math.PI / 2;
	for (let t = 0; t <= seconds + 0.6; t += 0.01) {
		// A smooth start and stop: rate = angle/seconds * (1 - cos(2 pi t/seconds))
		const inTurn = t < seconds;
		const phase = (2 * Math.PI * t) / seconds;
		const rate = inTurn ? (angle / seconds) * (1 - Math.cos(phase)) : 0;
		const angular = inTurn ? (angle / seconds) * ((2 * Math.PI) / seconds) * Math.sin(phase) : 0;
		samples.push(
			sample({
				gravity: UPRIGHT,
				rotationRate: { x: 0, y: rate, z: 0 },
				// Along the circle (the screen's x) and towards the axis (out of its face)
				acceleration: { x: radius * angular, y: 0, z: radius * rate * rate },
				timeMs: t * 1000,
			}),
		);
	}
	return samples;
}

function swivelsOf(samples: MotionSample[]): Swivel[] {
	let gauge = ARC_GAUGE_START;
	const swivels: Swivel[] = [];
	for (const s of samples) {
		const step = stepArcGauge(gauge, s);
		gauge = step.gauge;
		if (step.ended) swivels.push(step.ended);
	}
	return swivels;
}

describe("swivelRate", () => {
	it("is the turn about the vertical, anticlockwise seen from above, in any pose", () => {
		expect(swivelRate(sample({ gravity: FLAT, rotationRate: { x: 0, y: 0, z: 1 } }))).toBe(1);
		expect(swivelRate(sample({ gravity: UPRIGHT, rotationRate: { x: 0, y: 1, z: 0 } }))).toBe(1);
	});

	it("leaves out turns that tip the phone", () => {
		expect(swivelRate(sample({ gravity: FLAT, rotationRate: { x: 1, y: 1, z: 0 } }))).toBeCloseTo(
			0,
		);
	});
});

describe("levelAcceleration", () => {
	it("leaves out pushes up and down", () => {
		const s = sample({ gravity: UPRIGHT, acceleration: { x: 3, y: 5, z: 4 } });
		expect(levelAcceleration(s)).toBeCloseTo(5);
	});
});

describe("uprightness", () => {
	it("is 0 flat on either face and a right angle upright", () => {
		expect(uprightness(FLAT)).toBe(0);
		expect(uprightness({ x: 0, y: 0, z: 1 })).toBe(0);
		expect(uprightness(UPRIGHT)).toBeCloseTo(90 * DEG);
		expect(uprightness({ x: 0, y: -1, z: -1 })).toBeCloseTo(45 * DEG);
	});
});

describe("stepArcGauge", () => {
	it("measures a turn on the spot's swing about the body", () => {
		const [turn] = swivelsOf(quarterTurn(0.35));
		expect(turn.turned).toBeCloseTo(Math.PI / 2, 1);
		expect(turn.radius).toBeCloseTo(0.35, 1);
	});

	it("measures a wrist roll as a swivel about the phone itself", () => {
		const [roll] = swivelsOf(quarterTurn(0.02, 0.4));
		expect(roll.radius).toBeLessThan(0.05);
	});

	it("reports each swivel once, when it has been quiet for a moment", () => {
		const first = quarterTurn(0.3);
		const second = quarterTurn(0.02).map((s) => ({ ...s, timeMs: s.timeMs + 1500 }));
		expect(swivelsOf([...first, ...second])).toHaveLength(2);
	});

	it("ignores hand shake too small or slow to be a gesture", () => {
		const shake = Array.from({ length: 100 }, (_, i) =>
			sample({ rotationRate: { x: 0, y: 0, z: 0.2 * Math.sin(i) }, timeMs: i * 10 }),
		);
		expect(swivelsOf(shake)).toEqual([]);
	});

	it("reads a turn on the spot as one early in the turn, and keeps that reading", () => {
		const [turn] = swivelsOf(quarterTurn(0.3));
		expect(turn.decided).not.toBeNull();
		expect(turn.decided?.afterTurn).toBeLessThan(15 * DEG);
	});

	it("never reads a wrist roll as a turn on the spot", () => {
		let gauge = ARC_GAUGE_START;
		for (const s of quarterTurn(0.03, 0.4)) {
			gauge = stepArcGauge(gauge, s).gauge;
			expect(isTurnOnTheSpot(gauge)).toBe(false);
		}
	});

	it("reads the same radius at any sample rate", () => {
		const at100 = quarterTurn(0.3);
		const at50 = at100.filter((_, i) => i % 2 === 0);
		const [a] = swivelsOf(at100);
		const [b] = swivelsOf(at50);
		expect(b.radius).toBeCloseTo(a.radius ?? 0, 1);
	});

	it("calls no wrist roll a turn on the spot in a recording from a real phone", () => {
		// iPhone held upright on a sofa: ten seconds held still, then rolls about the long side,
		// five steering-sized (38 to 79 degrees end to end) and two big (123 and 167); an eighth
		// runs on past the recording's end
		const swivels = swivelsOf(trace("ios-upright-still-and-rolls.json"));
		expect(swivels).toHaveLength(7);
		for (const roll of swivels) {
			expect(roll.decided).toBeNull();
			expect(roll.radius ?? 0).toBeLessThan(0.08);
		}
	});

	it("calls each torso turn a turn on the spot as it starts, in a recording from a real phone", () => {
		// iPhone held upright on a sofa: held still, six torso turns of about 80 degrees, then six
		// wrist rolls
		const swivels = swivelsOf(trace("ios-upright-turns-and-rolls.json"));
		expect(swivels).toHaveLength(12);
		const turns = swivels.slice(0, 6);
		const rolls = swivels.slice(6);
		for (const turn of turns) {
			expect(turn.decided?.afterMs).toBeLessThanOrEqual(50);
			expect(turn.decided?.afterTurn).toBeLessThan(3 * DEG);
		}
		for (const roll of rolls) expect(roll.decided).toBeNull();
	});

	it("skips a sample read again at the same moment, as Android resends the last", () => {
		const turn = quarterTurn(0.3).flatMap((s) => [s, s]);
		const [once] = swivelsOf(quarterTurn(0.3));
		expect(swivelsOf(turn)).toEqual([once]);
	});

	it("ends a swivel at a gap in the samples, and starts over", () => {
		const turn = quarterTurn(0.3).slice(0, 60);
		const after = sample({ gravity: UPRIGHT, timeMs: 5000 });
		expect(swivelsOf([...turn, after])).toHaveLength(1);
	});
});
