import { FLAT, type LevelPoses } from "../../domain/levelPose";
import type { GameSettings } from "../../domain/types";
import type { GameStore } from "../GameStore";

/** The level poses the settings hold; one never set reads flat */
function levelPosesOf(settings: GameSettings): LevelPoses {
	return { up: settings.tiltZero ?? FLAT.up, down: settings.tiltZeroDown ?? FLAT.down };
}

/**
 * Push the level poses (screen up, turned over) to whoever measures tilt (the session, the
 * interface) now and whenever either changes, including when persisted settings load;
 * returns the unsubscribe.
 */
export function bindTiltZero(store: GameStore, apply: (poses: LevelPoses) => void): () => void {
	apply(levelPosesOf(store.getState().settings));
	return store.subscribe((state, previous) => {
		const now = state.settings;
		const was = previous.settings;
		if (now.tiltZero !== was.tiltZero || now.tiltZeroDown !== was.tiltZeroDown) {
			apply(levelPosesOf(now));
		}
	});
}
