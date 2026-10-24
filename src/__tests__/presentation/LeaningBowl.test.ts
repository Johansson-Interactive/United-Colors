import { describe, expect, it } from "vitest";
import type { Gravity } from "../../domain/types";
import {
	BOWL_TUNING,
	LEANING_BOWL_START,
	type LeaningBowl,
	stepLeaningBowl,
} from "../../presentation/probe/leaningBowl";

const TRAVEL = 90;
const FLAT: Gravity = { x: 0, y: 0, z: -1 };
/** Right edge lowered by `angle` from flat */
const rolled = (angle: number): Gravity => ({ x: Math.sin(angle), y: 0, z: -Math.cos(angle) });
/** Held upright in portrait */
const UPRIGHT: Gravity = { x: 0, y: -1, z: 0 };

/** The bowl after holding `gravity` for `ms`, sampled at 60 Hz from `from` */
function hold(bowl: LeaningBowl, gravity: Gravity, ms: number, from = bowl.timeMs ?? 0) {
	let next = bowl;
	for (let t = 0; t <= ms; t += 1000 / 60) {
		next = stepLeaningBowl(next, gravity, from + t, BOWL_TUNING, TRAVEL);
	}
	return next;
}

describe("leaning bowl", () => {
	it("settles home in whatever grip is held steady, upright included", () => {
		for (const grip of [FLAT, rolled(0.5), UPRIGHT]) {
			const bowl = hold(LEANING_BOWL_START, grip, 3000);
			expect(bowl.settled).toBe(true);
			expect(bowl.settles).toBe(1);
		}
	});

	it("rolls the dot the way the phone is tipped when the grip changes", () => {
		const steady = hold(LEANING_BOWL_START, FLAT, 2000);
		const tipped = hold(steady, rolled(0.3), 200);
		expect(tipped.dot.x).toBeGreaterThan(10);
		expect(tipped.settled).toBe(false);
	});

	it("leans to the new grip and settles there again", () => {
		const steady = hold(LEANING_BOWL_START, FLAT, 2000);
		const regripped = hold(steady, rolled(0.6), 5000);
		expect(regripped.settled).toBe(true);
		expect(regripped.settles).toBe(2);
	});

	it("keeps the dot inside the bowl however hard the phone is tipped", () => {
		const steady = hold(LEANING_BOWL_START, FLAT, 1000);
		let bowl = steady;
		for (let t = 0; t < 600; t += 1000 / 60) {
			bowl = stepLeaningBowl(bowl, rolled(1.4), 1000 + t, BOWL_TUNING, TRAVEL);
			expect(Math.hypot(bowl.dot.x, bowl.dot.y)).toBeLessThanOrEqual(TRAVEL + 1e-9);
		}
	});

	it("leans slower with a longer lean time", () => {
		const steady = hold(LEANING_BOWL_START, FLAT, 2000);
		const quick = hold(steady, rolled(0.3), 700);
		let slow = steady;
		for (let t = 0; t <= 700; t += 1000 / 60) {
			slow = stepLeaningBowl(slow, rolled(0.3), 2000 + t, { ...BOWL_TUNING, leanMs: 3000 }, TRAVEL);
		}
		expect(slow.dot.x).toBeGreaterThan(quick.dot.x);
	});
});
