import { describe, expect, it } from "vitest";
import { describeMotion } from "../../presentation/probe/probeReadout";

describe("motion probe", () => {
	it("reads how upright the phone stands and how fast it swivels", () => {
		const sample = {
			gravity: { x: 0, y: -1, z: 0 },
			rotationRate: { x: 0, y: Math.PI / 2, z: 0 },
			timeMs: 0,
		};
		expect(describeMotion(sample)).toBe("upright 90°  swivel 90°/s");
	});

	it("says so before the first sample", () => {
		expect(describeMotion(null)).toBe("no motion yet");
	});
});
