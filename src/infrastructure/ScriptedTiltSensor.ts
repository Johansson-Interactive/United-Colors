import type { SensorPort } from "../application/ports";
import type { Gravity, MotionSample } from "../domain/types";

/** Samples a second, about what a phone's motion sensor gives at a 60 Hz display */
const SAMPLE_HZ = 60;

const STILL = { x: 0, y: 0, z: 0 };

/**
 * A sensor that plays a scripted tilt path instead of reading the phone, for the bench run
 * (see application/bench.ts): `path` gives the gravity `seconds` after the sensor started. As
 * far as the samples say, the phone neither turns nor moves between them.
 */
export class ScriptedTiltSensor implements SensorPort {
	private timer: ReturnType<typeof setInterval> | null = null;
	private readonly listeners = new Set<(sample: MotionSample) => void>();

	constructor(
		private readonly path: (seconds: number) => Gravity,
		private readonly now: () => number = () => performance.now(),
	) {}

	start(): void {
		if (this.timer) return;
		const startedAt = this.now();
		this.timer = setInterval(() => {
			const timeMs = this.now();
			const sample: MotionSample = {
				gravity: this.path((timeMs - startedAt) / 1000),
				rotationRate: STILL,
				acceleration: STILL,
				timeMs,
			};
			for (const listener of this.listeners) listener(sample);
		}, 1000 / SAMPLE_HZ);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	onSample(listener: (sample: MotionSample) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
}
