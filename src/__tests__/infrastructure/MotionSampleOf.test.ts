import type { DeviceMotionMeasurement } from "expo-sensors";
import { describe, expect, it } from "vitest";
import { motionSampleOf } from "../../infrastructure/motionSampleOf";

/** A device-motion event lying flat and still, with the given parts */
function event(partial: Partial<DeviceMotionMeasurement>): DeviceMotionMeasurement {
	return {
		acceleration: null,
		accelerationIncludingGravity: { x: 0, y: 0, z: 0, timestamp: 0 },
		rotation: { alpha: 0, beta: 0, gamma: 0, timestamp: 12.5 },
		rotationRate: null,
		interval: 0,
		orientation: 0,
		...partial,
	};
}

describe("motionSampleOf", () => {
	it("reads the gyroscope about the phone's own axes on both platforms", () => {
		// 90 degrees a second about x (top edge towards the eyes), 180 about z (spun flat)
		const ios = motionSampleOf(
			event({ rotationRate: { alpha: 180, beta: 0, gamma: 90, timestamp: 0 } }),
			"ios",
		);
		const android = motionSampleOf(
			event({ rotationRate: { alpha: 90, beta: 0, gamma: 180, timestamp: 0 } }),
			"android",
		);
		for (const sample of [ios, android]) {
			expect(sample.rotationRate.x).toBeCloseTo(Math.PI / 2);
			expect(sample.rotationRate.y).toBeCloseTo(0);
			expect(sample.rotationRate.z).toBeCloseTo(Math.PI);
		}
	});

	it("reads a phone without a rate yet as still", () => {
		expect(motionSampleOf(event({}), "android").rotationRate).toEqual({ x: 0, y: 0, z: 0 });
	});

	it("stamps the sample with the sensor's time, in ms", () => {
		expect(motionSampleOf(event({}), "ios").timeMs).toBe(12500);
	});
});
