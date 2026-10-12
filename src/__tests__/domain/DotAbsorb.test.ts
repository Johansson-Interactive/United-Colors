import { ABSORB_TICKS, REJECT_TICKS } from "../../domain/constants";
import { Dot } from "../../domain/entities/Dot";

describe("Dot absorb", () => {
	it("moves freely until caught, then stops where it is", () => {
		const dot = new Dot("d", 100, 100, 1, 0, "#E91E63", 20, 4);
		dot.update(1);
		expect(dot.x).toBe(104);
		dot.startAbsorb();
		dot.update(2);
		expect(dot.x).toBe(104);
		expect(dot.vx).toBe(0);
		expect(dot.isAbsorbing).toBe(true);
	});

	it("merges over ABSORB_TICKS ticks and is only then flagged for removal", () => {
		const dot = new Dot("d", 0, 0, 0, 0, "#E91E63", 20, 0);
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
		const dot = new Dot("d", 0, 0, 0, 0, "#E91E63", 20, 0);
		dot.startAbsorb();
		dot.update(1);
		const progress = dot.absorb;
		dot.startAbsorb();
		expect(dot.absorb).toBe(progress);
	});
});

describe("Dot reject", () => {
	it("stops where it is and counts up to 1 over REJECT_TICKS, staying in play", () => {
		const dot = new Dot("d", 100, 100, 1, 0, "#E91E63", 20, 4);
		dot.startReject();
		expect(dot.isRejecting).toBe(true);
		for (let t = 1; t <= REJECT_TICKS + 3; t++) {
			dot.update(t);
			expect(dot.reject).toBeCloseTo(Math.min(1, t / REJECT_TICKS));
		}
		expect(dot.x).toBe(100);
		expect(dot.isFlaggedForRemoval).toBe(false);
	});

	it("rejecting again does not restart the refusal", () => {
		const dot = new Dot("d", 0, 0, 0, 0, "#E91E63", 20, 0);
		dot.startReject();
		dot.update(1);
		const progress = dot.reject;
		dot.startReject();
		expect(dot.reject).toBe(progress);
	});
});
