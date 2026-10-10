import type { TiltZero } from "../../domain/types";
import type { GameStore } from "../GameStore";

/**
 * Push the level pose to whoever measures tilt (the engine, the interface) now and whenever
 * it changes, including when persisted settings load; returns the unsubscribe.
 */
export function bindTiltZero(store: GameStore, apply: (zero: TiltZero | null) => void): () => void {
	apply(store.getState().settings.tiltZero);
	return store.subscribe((state, previous) => {
		if (state.settings.tiltZero !== previous.settings.tiltZero) apply(state.settings.tiltZero);
	});
}
