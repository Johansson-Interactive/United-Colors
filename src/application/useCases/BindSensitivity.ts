import type { GameStore } from "../GameStore";

/**
 * Push the tilt sensitivity to whoever moves things by tilt (the engine, the interface) now
 * and whenever it changes, including when persisted settings load; returns the unsubscribe.
 */
export function bindSensitivity(store: GameStore, apply: (multiplier: number) => void): () => void {
	apply(store.getState().settings.tiltSensitivity);
	return store.subscribe((state, previous) => {
		if (state.settings.tiltSensitivity !== previous.settings.tiltSensitivity) {
			apply(state.settings.tiltSensitivity);
		}
	});
}
