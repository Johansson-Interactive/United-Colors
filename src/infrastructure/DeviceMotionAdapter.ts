import { DeviceMotion } from "expo-sensors";
import type { Subscription } from "expo-sensors/build/DeviceSensor";
import type { SensorPort, SensorSample } from "../application/ports";
import { gravityFromRotation } from "./gravityFromRotation";

/**
 * Adapter wrapping Expo DeviceMotion for gyroscope-only player input.
 * Provides SensorSample, the direction of gravity, from gyro-fused device orientation (see
 * `gravityFromRotation`).
 * One native subscription fans out to every listener.
 */
export class DeviceMotionAdapter implements SensorPort {
	private subscription: Subscription | null = null;
	private readonly listeners = new Set<(sample: SensorSample) => void>();
	/**
	 * 0 = as fast as the platform allows. iOS clamps to Core Motion's max (~100 Hz);
	 * Android dispatches every display frame. A non-zero value on Android (strict `>` vs
	 * integer ms) skips frames: 16 ms yields ~30-40 Hz on 60/120 Hz displays.
	 * Android 12+ also needs HIGH_SAMPLING_RATE_SENSORS in app.json: without it, Expo
	 * requests SENSOR_DELAY_NORMAL natively, even when this dispatch interval is zero.
	 */
	private updateIntervalMs = 0;

	start(): void {
		if (this.subscription) return;

		DeviceMotion.setUpdateInterval(this.updateIntervalMs);

		this.subscription = DeviceMotion.addListener((data) => {
			if (this.listeners.size === 0) return;
			if (!data.rotation) return;

			const sample = gravityFromRotation(data.rotation.beta, data.rotation.gamma);
			for (const listener of this.listeners) listener(sample);
		});
	}

	stop(): void {
		if (this.subscription) {
			this.subscription.remove();
			this.subscription = null;
		}
	}

	onSample(listener: (sample: SensorSample) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
}
