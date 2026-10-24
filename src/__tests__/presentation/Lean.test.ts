import { describe, expect, it } from "vitest";
import { leanTowards } from "../../presentation/tilt/lean";

/** The lean after following `tilt` for `ms` in 16 ms frames from `from` */
function leaned(from: number, tilt: number, ms: number): number {
	let lean = from;
	for (let t = 0; t < ms; t += 16) lean = leanTowards(lean, tilt, 16);
	return lean;
}

describe("lean", () => {
	it("follows a new grip, most of the way within a quarter second", () => {
		const quarter = leaned(0, 0.3, 256);
		expect(quarter).toBeGreaterThan(0.3 * 0.6);
		expect(quarter).toBeLessThan(0.3);
	});

	it("arrives at a steady grip and stays there exactly, so a bowl at rest stops changing", () => {
		expect(leaned(0, 0.3, 3000)).toBe(0.3);
	});

	it("follows at the same pace at any frame rate", () => {
		let at120 = 0;
		for (let t = 0; t < 192; t += 8) at120 = leanTowards(at120, 0.3, 8);
		let at60 = 0;
		for (let t = 0; t < 192; t += 16) at60 = leanTowards(at60, 0.3, 16);
		expect(at120).toBeCloseTo(at60, 3);
	});
});
