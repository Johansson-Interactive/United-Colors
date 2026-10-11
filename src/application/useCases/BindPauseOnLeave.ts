import type { GameStore } from "../GameStore";

/** Report whether the app is in the foreground; returns the unsubscribe */
export type WatchAppActive = (listener: (active: boolean) => void) => () => void;

/**
 * Pause a running game when the player leaves the app (home, app switcher, an incoming call),
 * as the legacy activity did in onPause; returns the unsubscribe
 */
export function bindPauseOnLeave(
	store: GameStore,
	watchAppActive: WatchAppActive,
	pause: () => void,
): () => void {
	return watchAppActive((active) => {
		if (!active && store.getState().frame.phase === "RUNNING") pause();
	});
}
