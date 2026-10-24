import { stepTilt, TILT_START, type TiltState, takeLevelPose, tiltOf } from "../domain/tilt";
import type { TiltAngles } from "../domain/types";
import type { SensorPort } from "./ports";

/**
 * Where the level pose comes from: `fresh`, taken where the phone is held whenever the flow
 * asks (ADR 0016); or `flat` throughout, for the bench run, whose scripted tilt is measured from
 * flat (see bench.ts)
 */
export type LevelPoseRule = "fresh" | "flat";

/**
 * The player's tilt from the level pose (see tiltOf), measured once per sample for the game and
 * the interface alike, so both read it from the same pose. It wraps the motion sensor: whoever
 * owns it starts and stops it, the others only listen.
 *
 * The level pose is taken afresh whenever the flow asks, as a run starts and as Get ready ends;
 * until the first, it is flat.
 */
export class TiltSource {
	private readonly listeners = new Set<(tilt: TiltAngles) => void>();
	private state: TiltState = TILT_START;
	/** Stops following the sensor; null while stopped */
	private unbind: (() => void) | null = null;

	constructor(
		private readonly sensor: SensorPort,
		private readonly levelPose: LevelPoseRule = "fresh",
	) {}

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
		if (this.levelPose === "flat") return;
		this.state = takeLevelPose(this.state);
		this.emit();
	}

	/** Returns a function that removes this listener */
	onReading(listener: (tilt: TiltAngles) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private emit(): void {
		const tilt = tiltOf(this.state);
		for (const listener of this.listeners) listener(tilt);
	}
}
