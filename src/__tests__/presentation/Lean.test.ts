import { describe, expect, it } from "vitest";
import { followLean, type Lean } from "../../presentation/tilt/lean";

/** The lean after following the hand at `tilt` for `ms` in `frameMs` frames, from `from` */
function leaned(from: Lean | null, tilt: { x: number; y: number }, ms: number, frameMs = 16) {
	let lean = from;
	for (let t = 0; t < ms; t += frameMs) lean = followLean(lean, tilt, frameMs);
	if (!lean) throw new Error("no frames");
	return lean;
}

/** A bowl at rest, leaning to the hand held level */
const AT_REST: Lean = { down: { x: 0, y: 0 }, tilt: { x: 0, y: 0 } };

describe("lean", () => {
	it("starts leaning to the hand as it is, so the dot starts at rest in any grip", () => {
		expect(followLean(null, { x: 0.4, y: -0.2 }, 16)).toEqual({
			down: { x: 0.4, y: -0.2 },
			tilt: { x: 0, y: 0 },
		});
	});

	it("rolls the dot by a new grip, then follows it most of the way within a quarter second", () => {
		const first = followLean(AT_REST, { x: 0.3, y: 0 }, 16);
		expect(first.tilt.x).toBeGreaterThan(0.3 * 0.9);
		const quarter = leaned(AT_REST, { x: 0.3, y: 0 }, 256);
		expect(quarter.down.x).toBeGreaterThan(0.3 * 0.6);
		expect(quarter.down.x).toBeLessThan(0.3);
		expect(quarter.tilt.x).toBeCloseTo(0.3 - quarter.down.x);
	});

	it("arrives at a steady grip exactly, and then hands back the same lean, so a bowl at rest stops changing", () => {
		const settled = leaned(AT_REST, { x: 0.3, y: -0.1 }, 3000);
		expect(settled).toEqual({ down: { x: 0.3, y: -0.1 }, tilt: { x: 0, y: 0 } });
		expect(followLean(settled, { x: 0.3, y: -0.1 }, 16)).toBe(settled);
	});

	it("follows at the same pace at any frame rate", () => {
		const at120 = leaned(AT_REST, { x: 0.3, y: 0 }, 192, 8);
		const at60 = leaned(AT_REST, { x: 0.3, y: 0 }, 192, 16);
		expect(at120.down.x).toBeCloseTo(at60.down.x, 3);
	});
});
