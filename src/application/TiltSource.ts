import { stepTilt, TILT_START, type TiltState, takeLevelPose, tiltOf } from "../domain/tilt";
import type { TiltAngles } from "../domain/types";
import type { SensorPort } from "./ports";

/** One reading of the tilt from the level pose (see tiltOf) */
export type TiltReading = TiltAngles;

/** The reading before the sensor has given one: held at the level pose */
export const FLAT_READING: TiltReading = { x: 0, y: 0 };

/**
 * The player's tilt, measured once per sample for the game and the interface alike, so both
 * read it from the same level pose. It wraps the motion sensor: whoever owns it starts and stops
 * it, the others only listen.
 *
 * The level pose is taken afresh whenever the flow asks, as a run starts and as Get ready ends
 * (ADR 0016); until the first, it is flat.
 */
export class TiltSource {
	private readonly listeners = new Set<(reading: TiltReading) => void>();
	private state: TiltState = TILT_START;
	/** Stops following the sensor; null while stopped */
	private unbind: (() => void) | null = null;

	constructor(private readonly sensor: SensorPort) {}

	start(): void {
		if (this.unbind) return;
		this.unbind = this.sensor.onSample((sample) => {
			this.state = stepTilt(this.state, sample);
			this.emit();
		});
		this.sensor.start();
	}

	stop(): void {
		this.unbind?.();
		this.unbind = null;
		this.sensor.stop();
	}

	/** Take the level pose where the phone is held now, and read the tilt from it at once */
	takeLevelPose(): void {
		this.state = takeLevelPose(this.state);
		this.emit();
	}

	/** Returns a function that removes this listener */
	onReading(listener: (reading: TiltReading) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private emit(): void {
		const reading = tiltOf(this.state);
		for (const listener of this.listeners) listener(reading);
	}
}
