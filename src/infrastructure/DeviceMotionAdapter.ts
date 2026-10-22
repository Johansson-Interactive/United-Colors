import { DeviceMotion, Gyroscope } from "expo-sensors";
import type { Subscription } from "expo-sensors/build/DeviceSensor";
import type { SensorPort, SensorSample } from "../application/ports";
import { attitudeFromRotation } from "./attitudeFromRotation";

/**
 * Adapter wrapping Expo DeviceMotion for gyroscope-only player input.
 * Provides SensorSample, the phone's attitude, swivel included (see `attitudeFromRotation`).
 * A phone without a gyroscope reports nothing, so the no-tilt path takes over: its rotation
 * vector would lean on the compass alone for the swivel (ADR 0010).
 * One native subscription fans out to every listener.
 */
export class DeviceMotionAdapter implements SensorPort {
	private subscription: Subscription | null = null;
	/** True from start until stop, including while the gyroscope check is pending */
	private running = false;
	private hasGyroscope: Promise<boolean> | null = null;
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

	onSample(listener: (sample: SensorSample) => void): () => void {
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

			const { alpha, beta, gamma } = data.rotation;
			const sample = attitudeFromRotation(alpha, beta, gamma);
			for (const listener of this.listeners) listener(sample);
		});
	}
}
