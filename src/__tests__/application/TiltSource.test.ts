import { describe, expect, it } from "vitest";
import type { SensorPort } from "../../application/ports";
import { type TiltReading, TiltSource } from "../../application/TiltSource";
import { FLAT_GRAVITY, gravityAt } from "../../domain/tilt";
import type { Gravity, MotionSample } from "../../domain/types";

const DEG = Math.PI / 180;
const STILL = { x: 0, y: 0, z: 0 };

/** A sensor the test feeds by hand, a sample 10 ms after the last */
function handSensor() {
	const listeners = new Set<(sample: MotionSample) => void>();
	let started = false;
	let timeMs = 0;
	const sensor: SensorPort = {
		start: () => {
			started = true;
		},
		stop: () => {
			started = false;
		},
		onSample: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	return {
		sensor,
		hold: (gravity: Gravity) => {
			timeMs += 10;
			const sample = { gravity, rotationRate: STILL, acceleration: STILL, timeMs };
			for (const listener of listeners) listener(sample);
		},
		get started() {
			return started;
		},
		get listening() {
			return listeners.size;
		},
	};
}

function listen(source: TiltSource): TiltReading[] {
	const readings: TiltReading[] = [];
	source.onReading((reading) => readings.push(reading));
	return readings;
}

const RECLINED = gravityAt({ x: 0, y: 45 * DEG }, FLAT_GRAVITY);

describe("TiltSource", () => {
	it("starts and stops the sensor it wraps, following it only while started", () => {
		const hand = handSensor();
		const source = new TiltSource(hand.sensor);
		source.start();
		expect(hand.started).toBe(true);
		expect(hand.listening).toBe(1);
		source.stop();
		expect(hand.started).toBe(false);
		expect(hand.listening).toBe(0);
	});

	it("reads tilt from flat until a level pose is taken", () => {
		const hand = handSensor();
		const source = new TiltSource(hand.sensor);
		const readings = listen(source);
		source.start();
		hand.hold(RECLINED);
		expect(readings.at(-1)?.y).toBeCloseTo(45 * DEG);
	});

	it("takes the level pose where the phone is held, and reads from it at once", () => {
		const hand = handSensor();
		const source = new TiltSource(hand.sensor);
		const readings = listen(source);
		source.start();
		hand.hold(RECLINED);
		source.takeLevelPose();
		expect(readings.at(-1)?.x).toBeCloseTo(0);
		expect(readings.at(-1)?.y).toBeCloseTo(0);
		hand.hold(gravityAt({ x: 0.1, y: 0 }, RECLINED));
		expect(readings.at(-1)?.x).toBeCloseTo(0.1, 2);
	});

	it("feeds every listener the same reading", () => {
		const hand = handSensor();
		const source = new TiltSource(hand.sensor);
		const a = listen(source);
		const b = listen(source);
		source.start();
		hand.hold(RECLINED);
		expect(a).toEqual(b);
		expect(a).toHaveLength(1);
	});
});
