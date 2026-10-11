import { ABSORB_TICKS } from "../../domain/constants";
import { Dot, resetDotIdCounter } from "../../domain/entities/Dot";

describe("Dot absorb", () => {
	beforeEach(() => {
		resetDotIdCounter();
	});

	it("moves freely until caught, then stops where it is", () => {
		const dot = new Dot(100, 100, 1, 0, "#E91E63", 20, 4);
		dot.update(1);
		expect(dot.x).toBe(104);
		dot.startAbsorb();
		dot.update(2);
		expect(dot.x).toBe(104);
		expect(dot.vx).toBe(0);
		expect(dot.isAbsorbing).toBe(true);
	});

	it("merges over ABSORB_TICKS ticks and is only then flagged for removal", () => {
		const dot = new Dot(0, 0, 0, 0, "#E91E63", 20, 0);
		dot.startAbsorb();
		expect(dot.absorb).toBe(0);
		for (let t = 1; t < ABSORB_TICKS; t++) {
			dot.update(t);
			expect(dot.absorb).toBeCloseTo(t / ABSORB_TICKS);
			expect(dot.isFlaggedForRemoval).toBe(false);
		}
		dot.update(ABSORB_TICKS);
		expect(dot.absorb).toBe(1);
		expect(dot.isFlaggedForRemoval).toBe(true);
	});

	it("catching an already merging dot again does not restart the merge", () => {
		const dot = new Dot(0, 0, 0, 0, "#E91E63", 20, 0);
		dot.startAbsorb();
		dot.update(1);
		const progress = dot.absorb;
		dot.startAbsorb();
		expect(dot.absorb).toBe(progress);
	});
});
