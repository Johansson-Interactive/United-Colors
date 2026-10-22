import {
	FLAT_ATTITUDES,
	type LevelAttitudes,
	type LevelTilt,
	levelPosesOf,
	levelTilt,
	zeroSwivel,
} from "../domain/levelPose";
import type { Attitude, PoseSide } from "../domain/types";
import type { GameStore } from "./GameStore";
import type { SensorPort } from "./ports";

/** One reading of the tilt: the attitude it was measured on, and the tilt from the pose in use */
export interface TiltReading extends LevelTilt {
	attitude: Attitude;
}

/** The reading before the sensor has given one: held flat, at the flat pose */
export const FLAT_READING: TiltReading = { x: 0, y: 0, side: "up", attitude: FLAT_ATTITUDES.up };

/**
 * The player's tilt, measured once per sample for the game and the interface alike, so both
 * read it from the same level pose (see levelTilt). It wraps the motion sensor: whoever owns it
 * starts and stops it, the others only listen.
 *
 * The settings keep each level pose as a gravity; tilt is measured from attitudes, each saved
 * gravity turned about the vertical to face the way the phone faced when the swivel was last
 * zeroed (ADR 0010). That zero lives here, in memory only: the first sample sets it, and after
 * that only `zeroSwivel` moves it, so poses loaded from storage keep it rather than taking
 * whatever way the phone happens to face as they land. Whenever the poses change, the latest
 * attitude is read again, so the change shows at once.
 */
export class TiltSource {
	private readonly listeners = new Set<(reading: TiltReading) => void>();
	private poses: LevelAttitudes = FLAT_ATTITUDES;
	/** The level pose the last reading was measured from */
	private side: PoseSide = "up";
	/** The latest sample, and the one the swivel was last zeroed at */
	private latest: Attitude | null = null;
	private zeroedAt: Attitude | null = null;
	/** Stops following the sensor and the settings; null while stopped */
	private unbind: (() => void) | null = null;

	constructor(
		private readonly sensor: SensorPort,
		private readonly store: GameStore,
	) {}

	start(): void {
		if (this.unbind) return;
		const stopListening = this.sensor.onSample((attitude) => this.read(attitude));
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

	/**
	 * Zero the swivel where the phone is held now, for both level poses: the player is at their
	 * level pose by definition (see screenFlow.ts). Nothing happens before the first sample.
	 */
	zeroSwivel(): void {
		if (!this.latest) return;
		this.zeroedAt = this.latest;
		this.remake();
	}

	private posesNow(): LevelAttitudes {
		const saved = levelPosesOf(this.store.getState().settings.levelPoses);
		return zeroSwivel(saved, this.zeroedAt ?? FLAT_ATTITUDES.up);
	}

	/** Take up the poses as they now stand, and read the latest attitude from them */
	private remake(): void {
		this.poses = this.posesNow();
		if (this.latest) this.emit(this.latest);
	}

	private read(attitude: Attitude): void {
		this.latest = attitude;
		// The first sample zeroes the swivel, which reads it from the poses that makes
		if (this.zeroedAt) this.emit(attitude);
		else this.zeroSwivel();
	}

	private emit(attitude: Attitude): void {
		const tilt = levelTilt(attitude, this.poses, this.side);
		this.side = tilt.side;
		const reading: TiltReading = { ...tilt, attitude };
		for (const listener of this.listeners) listener(reading);
	}
}
