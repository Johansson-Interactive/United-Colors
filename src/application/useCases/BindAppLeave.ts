import type { WatchAppActive } from "../ports";

/**
 * Report each time the player leaves the app (home, app switcher, an incoming call), as the
 * legacy activity's onPause did; returns the unsubscribe. What a leave does depends on the
 * screen (a run in play pauses, Get ready closes), so the caller decides.
 */
export function bindAppLeave(watchAppActive: WatchAppActive, onLeave: () => void): () => void {
	return watchAppActive((active) => {
		if (!active) onLeave();
	});
}
