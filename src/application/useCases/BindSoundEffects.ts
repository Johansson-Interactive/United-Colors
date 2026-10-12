import type { GameStore } from "../GameStore";
import { onGameEvents } from "../gameEvents";
import type { GameAudio } from "../ports";

/**
 * A sound for each catch and spawn, and the stinger as a run ends; the spit is felt, not
 * heard. Returns the unsubscribe.
 */
export function bindSoundEffects(store: GameStore, audio: GameAudio): () => void {
	return onGameEvents(store, (event) => {
		switch (event.type) {
			case "collect":
				audio.playCollect();
				return;
			case "collectPoint":
				audio.playLargeCollect();
				return;
			case "pointSpawn":
				audio.playPointSpawn();
				return;
			case "gameOver":
				audio.playGameOver();
				return;
			case "spit":
				return;
		}
	});
}
