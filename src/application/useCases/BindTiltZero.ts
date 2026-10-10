import type { TiltZero } from "../../domain/types";
import type { GameStore } from "../GameStore";

/**
 * Push the level poses (screen up, screen down) to whoever measures tilt (the engine, the
 * interface) now and whenever either changes, including when persisted settings load;
 * returns the unsubscribe.
 */
export function bindTiltZero(
	store: GameStore,
	apply: (zero: TiltZero | null, zeroDown: TiltZero | null) => void,
): () => void {
	const { settings } = store.getState();
	apply(settings.tiltZero, settings.tiltZeroDown);
	return store.subscribe((state, previous) => {
		const now = state.settings;
		const was = previous.settings;
		if (now.tiltZero !== was.tiltZero || now.tiltZeroDown !== was.tiltZeroDown) {
			apply(now.tiltZero, now.tiltZeroDown);
		}
	});
}
