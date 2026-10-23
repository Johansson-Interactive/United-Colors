import {
	FLAT,
	type LevelPoses,
	type LevelTilt,
	levelPosesOf,
	levelTilt,
} from "../domain/levelPose";
import type { Gravity, PoseSide } from "../domain/types";
import type { GameStore } from "./GameStore";
import type { SensorPort } from "./ports";

/** One reading of the tilt: the gravity it was measured on, and the tilt from the pose in use */
export interface TiltReading extends LevelTilt {
	gravity: Gravity;
}

/** The reading before the sensor has given one: held flat, at the flat pose */
export const FLAT_READING: TiltReading = { x: 0, y: 0, side: "up", gravity: FLAT.up };

/**
 * The player's tilt, measured once per sample for the game and the interface alike, so both
 * read it from the same level pose (see levelTilt). It wraps the motion sensor: whoever owns it
 * starts and stops it, the others only listen.
 *
 * Tilt is read from gravity alone (ADR 0014), so the level poses are the gravities the settings
 * keep. Whenever they change, the latest gravity is read again, so the change shows at once.
 */
export class TiltSource {
	private readonly listeners = new Set<(reading: TiltReading) => void>();
	private poses: LevelPoses = FLAT;
	/** The level pose the last reading was measured from */
	private side: PoseSide = "up";
	private latest: Gravity | null = null;
	/** Stops following the sensor and the settings; null while stopped */
	private unbind: (() => void) | null = null;

	constructor(
		private readonly sensor: SensorPort,
		private readonly store: GameStore,
	) {}

	start(): void {
		if (this.unbind) return;
		const stopListening = this.sensor.onSample((gravity) => this.read(gravity));
		const stopFollowing = this.store.subscribe((state, previous) => {
			if (state.settings.levelPoses !== previous.settings.levelPoses) this.remake();
		});
		this.unbind = () => {
			stopListening();
			stopFollowing();
		};
		this.poses = this.posesNow();
		this.sensor.start();
	}

	stop(): void {
		this.unbind?.();
		this.unbind = null;
		this.sensor.stop();
	}

	/** Returns a function that removes this listener */
	onReading(listener: (reading: TiltReading) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private posesNow(): LevelPoses {
		return levelPosesOf(this.store.getState().settings.levelPoses);
	}

	/** Take up the poses as they now stand, and read the latest gravity from them */
	private remake(): void {
		this.poses = this.posesNow();
		if (this.latest) this.emit(this.latest);
	}

	private read(gravity: Gravity): void {
		this.latest = gravity;
		this.emit(gravity);
	}

	private emit(gravity: Gravity): void {
		const tilt = levelTilt(gravity, this.poses, this.side);
		this.side = tilt.side;
		const reading: TiltReading = { ...tilt, gravity };
		for (const listener of this.listeners) listener(reading);
	}
}
