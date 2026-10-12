import type { GameStore } from "../GameStore";
import { onGameEvents } from "../gameEvents";
import type { GameHaptics } from "../ports";

/** Buzz once as the player spits out a wrong-colour dot; returns the unsubscribe */
export function bindHaptics(store: GameStore, haptics: GameHaptics): () => void {
	return onGameEvents(store, (event) => {
		if (event.type === "spit") haptics.spit();
	});
}
