import {
	FLAT,
	FLAT_ATTITUDES,
	type LevelAttitudes,
	type LevelPoses,
	zeroSwivel,
} from "../../domain/levelPose";
import type { Attitude, GameSettings } from "../../domain/types";
import type { GameStore } from "../GameStore";
import type { SensorPort } from "../ports";

/** The level poses the settings hold, as gravities; one never set reads flat */
function levelPosesOf(settings: GameSettings): LevelPoses {
	return { up: settings.tiltZero ?? FLAT.up, down: settings.tiltZeroDown ?? FLAT.down };
}

/** The level poses as they reach whoever measures tilt, and the swivel zeroing that remakes them */
export interface LevelPoseBinding {
	/**
	 * Zero the swivel where the phone is held now: the player is at their level pose by
	 * definition (a run starting from the title, the cup opening, the bowl writing a pose).
	 * Nothing happens before the sensor's first sample.
	 */
	zero(): void;
	/** Stop applying the poses and stop listening to the sensor */
	unbind(): void;
}

/**
 * Push the level poses (screen up, turned over) to whoever measures tilt (the session, the
 * interface) now and whenever they change, including when persisted settings load.
 *
 * The settings keep each pose as a gravity; the poses pushed are attitudes, each saved gravity
 * turned about the vertical to face the way the phone faced when the swivel was last zeroed
 * (ADR 0010). That zero lives here, in memory only: the sensor's first sample sets it, and
 * after that only `zero` moves it, so a newly saved pose keeps it rather than taking whatever
 * way the phone happens to face as the settings change.
 */
export function bindTiltZero(
	store: GameStore,
	sensor: SensorPort,
	apply: (poses: LevelAttitudes) => void,
): LevelPoseBinding {
	/** The latest sample, and the one the swivel was last zeroed at */
	let latest: Attitude | null = null;
	let zeroedAt: Attitude | null = null;

	const push = () =>
		apply(zeroSwivel(levelPosesOf(store.getState().settings), zeroedAt ?? FLAT_ATTITUDES.up));

	const zero = () => {
		if (!latest) return;
		zeroedAt = latest;
		push();
	};

	push();
	const stopListening = sensor.onSample((sample) => {
		latest = sample;
		if (!zeroedAt) zero();
	});
	const stopFollowing = store.subscribe((state, previous) => {
		const now = state.settings;
		const was = previous.settings;
		if (now.tiltZero !== was.tiltZero || now.tiltZeroDown !== was.tiltZeroDown) push();
	});

	return {
		zero,
		unbind: () => {
			stopListening();
			stopFollowing();
		},
	};
}
