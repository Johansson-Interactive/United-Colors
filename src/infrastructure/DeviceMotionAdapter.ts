import { DeviceMotion, Gyroscope } from "expo-sensors";
import type { Subscription } from "expo-sensors/build/DeviceSensor";
import type { SensorPort } from "../application/ports";
import type { MotionSample } from "../domain/types";
import { type MotionPlatform, motionSampleOf } from "./motionSampleOf";

/**
 * Adapter wrapping Expo DeviceMotion for gyroscope-only player input.
 * Reports gravity from the gyroscope-fused rotation (see `gravityFromRotation`), with the
 * gyroscope's rate and the hand's push alongside, the same way round on both platforms (see
 * `motionSampleOf`).
 * A phone without a gyroscope reports nothing, so the no-tilt path takes over: its gravity would
 * come from the accelerometer alone, which shakes as the hand moves.
 * One native subscription fans out to every listener.
 */
export class DeviceMotionAdapter implements SensorPort {
	private subscription: Subscription | null = null;
	/** True from start until stop, including while the gyroscope check is pending */
	private running = false;
	private hasGyroscope: Promise<boolean> | null = null;
	private readonly listeners = new Set<(sample: MotionSample) => void>();
	/**
	 * 0 = as fast as the platform allows. iOS clamps to Core Motion's max (~100 Hz);
	 * Android dispatches every display frame. A non-zero value on Android (strict `>` vs
	 * integer ms) skips frames: 16 ms yields ~30-40 Hz on 60/120 Hz displays.
	 * Android 12+ also needs HIGH_SAMPLING_RATE_SENSORS in app.json: without it, Expo
	 * requests SENSOR_DELAY_NORMAL natively, even when this dispatch interval is zero.
	 */
	private updateIntervalMs = 0;

	constructor(private readonly platform: MotionPlatform) {}

	start(): void {
		if (this.running) return;
		this.running = true;

		this.hasGyroscope ??= Gyroscope.isAvailableAsync().catch(() => false);
		void this.hasGyroscope.then((available) => {
			if (available && this.running && !this.subscription) this.subscribe();
		});
	}

	stop(): void {
		this.running = false;
		if (this.subscription) {
			this.subscription.remove();
			this.subscription = null;
		}
	}

	onSample(listener: (sample: MotionSample) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private subscribe(): void {
		DeviceMotion.setUpdateInterval(this.updateIntervalMs);

		this.subscription = DeviceMotion.addListener((data) => {
			if (this.listeners.size === 0) return;
			if (!data.rotation) return;

			const sample = motionSampleOf(data, this.platform);
			for (const listener of this.listeners) listener(sample);
		});
	}
}
