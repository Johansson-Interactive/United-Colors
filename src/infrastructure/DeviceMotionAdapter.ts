import { DeviceMotion } from "expo-sensors";
import type { Subscription } from "expo-sensors/build/DeviceSensor";
import type { SensorPort, SensorSample } from "../domain/types";
import { tiltFromRotation } from "./tiltFromRotation";

/**
 * Adapter wrapping Expo DeviceMotion for gyroscope-only player input.
 * Provides SensorSample { x, y, facingDown } from gyro-fused device orientation (radians),
 * measured from flat screen up or screen down (see `tiltFromRotation`).
 * One native subscription fans out to every listener.
 */
export class DeviceMotionAdapter implements SensorPort {
	private subscription: Subscription | null = null;
	private readonly listeners = new Set<(sample: SensorSample) => void>();
	/**
	 * 0 = as fast as the platform allows. iOS clamps to Core Motion's max (~100 Hz);
	 * Android dispatches every display frame. A non-zero value on Android (strict `>` vs
	 * integer ms) skips frames: 16 ms yields ~30-40 Hz on 60/120 Hz displays.
	 */
	private updateIntervalMs = 0;
	/** Which way the screen faced at the last sample */
	private facingDown = false;

	start(): void {
		if (this.subscription) return;

		DeviceMotion.setUpdateInterval(this.updateIntervalMs);

		this.subscription = DeviceMotion.addListener((data) => {
			if (this.listeners.size === 0) return;
			if (!data.rotation) return;

			const { x, y, facingDown } = tiltFromRotation(
				data.rotation.beta,
				data.rotation.gamma,
				this.facingDown,
			);
			this.facingDown = facingDown;
			const sample = { x, y, facingDown };
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
