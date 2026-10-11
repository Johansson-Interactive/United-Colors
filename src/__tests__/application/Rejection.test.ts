import {
	REJECT_REACH_END,
	REJECT_SPIT_AT,
	rejectPush,
	rejectRecoil,
	rejectWrap,
} from "../../application/rejection";

const samples = Array.from({ length: 101 }, (_, i) => i / 100);

describe("rejection curves", () => {
	it("the film spreads out, holds with a shiver, then draws back before the end", () => {
		expect(rejectWrap(0)).toBe(0);
		expect(rejectWrap(REJECT_REACH_END)).toBeCloseTo(1);
		const held = samples.filter((r) => r >= REJECT_REACH_END && r < REJECT_SPIT_AT);
		const wraps = held.map(rejectWrap);
		expect(Math.max(...wraps)).toBeGreaterThan(1);
		expect(Math.min(...wraps)).toBeLessThan(1);
		expect(Math.min(...wraps)).toBeGreaterThan(0.9);
		expect(rejectWrap(0.9)).toBe(0);
		expect(rejectWrap(1)).toBe(0);
	});

	it("the film only grows while reaching and only shrinks once the dot is spat", () => {
		for (let i = 1; i < samples.length; i++) {
			const [a, b] = [samples[i - 1], samples[i]];
			if (b <= REJECT_REACH_END) expect(rejectWrap(b)).toBeGreaterThanOrEqual(rejectWrap(a));
			if (a >= REJECT_SPIT_AT) expect(rejectWrap(b)).toBeLessThanOrEqual(rejectWrap(a));
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
		expect(rejectRecoil(0.5)).toBe(0);
		const peak = Math.max(...samples.map(rejectRecoil));
		expect(peak).toBeCloseTo(1, 1);
		expect(rejectRecoil(1)).toBeCloseTo(0);
	});
});
