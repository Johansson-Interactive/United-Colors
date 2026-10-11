import {
	REJECT_PRESS_DEPTH,
	REJECT_PRESS_END,
	REJECT_SPIT_AT,
	REJECT_SPIT_GAP,
	rejectPenetration,
	rejectPress,
	rejectPush,
	rejectRecoil,
} from "../../application/rejection";

const samples = Array.from({ length: 101 }, (_, i) => i / 100);

describe("rejection curves", () => {
	it("the dot presses in, holds with a quiver, and stays pressed once the push takes over", () => {
		expect(rejectPress(0)).toBe(0);
		expect(rejectPress(REJECT_PRESS_END)).toBeCloseTo(1);
		const held = samples.filter((r) => r >= REJECT_PRESS_END && r < REJECT_SPIT_AT);
		const presses = held.map(rejectPress);
		expect(Math.max(...presses)).toBeGreaterThan(1);
		expect(Math.min(...presses)).toBeLessThan(1);
		expect(Math.min(...presses)).toBeGreaterThan(0.9);
		expect(rejectPress(0.8)).toBe(1);
		for (let i = 1; i < samples.length && samples[i] <= REJECT_PRESS_END; i++) {
			expect(rejectPress(samples[i])).toBeGreaterThanOrEqual(rejectPress(samples[i - 1]));
		}
	});

	it("the dot is held until the spit, then pushed steadily clear", () => {
		expect(rejectPush(REJECT_SPIT_AT)).toBe(0);
		expect(rejectPush(0.3)).toBe(0);
		expect(rejectPush(1)).toBe(1);
		for (let i = 1; i < samples.length; i++) {
			expect(rejectPush(samples[i])).toBeGreaterThanOrEqual(rejectPush(samples[i - 1]));
		}
	});

	it("the player recoils at the spit and has settled back by the end", () => {
		expect(rejectRecoil(REJECT_SPIT_AT - 0.1)).toBe(0);
		const peak = Math.max(...samples.map(rejectRecoil));
		expect(peak).toBeCloseTo(1, 1);
		expect(rejectRecoil(1)).toBeCloseTo(0);
	});

	it("the dot sinks from where it touched to the press depth, then out past the surface", () => {
		expect(rejectPenetration(0, 1, 10)).toBe(1);
		expect(rejectPenetration(REJECT_PRESS_END, 1, 10)).toBeCloseTo(10 * REJECT_PRESS_DEPTH);
		expect(rejectPenetration(1, 1, 10)).toBeCloseTo(-10 * REJECT_SPIT_GAP);
	});

	it("a dot that touched deeper than the press depth sinks no further", () => {
		expect(rejectPenetration(REJECT_PRESS_END, 8, 10)).toBeCloseTo(8);
	});
});
