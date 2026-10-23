import { describe, expect, it } from "vitest";
import type { MotionSample } from "../../domain/types";
import {
	clearProbe,
	describeLive,
	describeSwivel,
	PROBE_START,
	stepProbe,
} from "../../presentation/probe/probeReadout";

const UPRIGHT = { x: 0, y: -1, z: 0 };
const STILL = { x: 0, y: 0, z: 0 };

/** Upright, swivelling at `rate` (radians a second) at `ms`, swung at 30 cm */
function swivelling(rate: number, ms: number): MotionSample {
	return {
		gravity: UPRIGHT,
		rotationRate: { x: 0, y: rate, z: 0 },
		acceleration: { x: 0, y: 0, z: 0.3 * rate * rate },
		timeMs: ms,
	};
}

function played(samples: MotionSample[]) {
	let state = PROBE_START;
	for (const sample of samples) state = stepProbe(state, sample).state;
	return state;
}

describe("motion probe", () => {
	it("reads how upright the phone stands and how hard it is pushed", () => {
		const state = played([
			{ gravity: UPRIGHT, rotationRate: STILL, acceleration: { x: 3, y: 0, z: 4 }, timeMs: 0 },
		]);
		expect(describeLive(state)).toBe("upright 90°  swivel 0°/s  push 5.00 m/s²");
	});

	it("keeps each finished swivel, latest first", () => {
		const turn = (from: number, rate: number) => [
			...Array.from({ length: 50 }, (_, i) => swivelling(rate, from + i * 10)),
			...Array.from({ length: 40 }, (_, i) => swivelling(0, from + 500 + i * 10)),
		];
		const state = played([...turn(0, 3), ...turn(2000, -2)]);
		expect(state.swivels.map((s) => Math.sign(s.turned))).toEqual([-1, 1]);
		expect(describeSwivel(state.swivels[1])).toMatch(
			/^arc \d+ cm {2}turned 90° {2}peak 172°\/s {2}\d+ ms$/,
		);
		expect(clearProbe(state).swivels).toEqual([]);
	});
});
