import type { SensorPort } from "../application/ports";
import type { Gravity } from "../domain/types";

/** Samples a second, about what a phone's motion sensor gives at a 60 Hz display */
const SAMPLE_HZ = 60;

/**
 * A sensor that plays a scripted tilt path instead of reading the phone, for the bench run
 * (see application/bench.ts): `path` gives the sample `seconds` after the sensor started.
 */
export class ScriptedTiltSensor implements SensorPort {
	private timer: ReturnType<typeof setInterval> | null = null;
	private readonly listeners = new Set<(gravity: Gravity) => void>();

	constructor(
		private readonly path: (seconds: number) => Gravity,
		private readonly now: () => number = () => performance.now(),
	) {}

	start(): void {
		if (this.timer) return;
		const startedAt = this.now();
		this.timer = setInterval(() => {
			const sample = this.path((this.now() - startedAt) / 1000);
			for (const listener of this.listeners) listener(sample);
		}, 1000 / SAMPLE_HZ);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	onSample(listener: (gravity: Gravity) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
}
