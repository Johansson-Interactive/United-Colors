import { LEAN_GAP_SHARE, LEAN_MAX_REACH, LEAN_RANGE, leanReach } from "../../application/lean";

describe("leanReach", () => {
	it("is 0 out of range, touching, or with no size", () => {
		expect(leanReach(LEAN_RANGE * 20, 20, 10)).toBe(0);
		expect(leanReach(LEAN_RANGE * 20 + 5, 20, 10)).toBe(0);
		expect(leanReach(0, 20, 10)).toBe(0);
		expect(leanReach(-3, 20, 10)).toBe(0);
		expect(leanReach(10, 0, 10)).toBe(0);
		expect(leanReach(10, 20, 0)).toBe(0);
	});

	it("reaches further as the player comes nearer, up to its full reach", () => {
		let previous = 0;
		// Down to where the gap share starts to cap it
		for (let gap = LEAN_RANGE * 20; gap >= 8; gap -= 2) {
			const reach = leanReach(gap, 20, 10);
			expect(reach).toBeGreaterThanOrEqual(previous);
			expect(reach).toBeLessThanOrEqual(LEAN_MAX_REACH * 10);
			previous = reach;
		}
		expect(previous).toBeGreaterThan(0.9 * LEAN_MAX_REACH * 10);
	});

	it("never closes more than its share of the gap, so it is round again on contact", () => {
		for (let gap = 0.5; gap < LEAN_RANGE * 20; gap += 0.5) {
			expect(leanReach(gap, 20, 10)).toBeLessThanOrEqual(LEAN_GAP_SHARE * gap);
		}
	});

	it("scales with the dot, so its stretch never passes half its full reach", () => {
		expect(leanReach(40, 20, 10)).toBeCloseTo(2 * leanReach(40, 20, 5));
		for (let gap = 0.5; gap < LEAN_RANGE * 20; gap += 0.5) {
			expect(leanReach(gap, 20, 10) / (2 * 10)).toBeLessThanOrEqual(LEAN_MAX_REACH / 2);
		}
	});
});
