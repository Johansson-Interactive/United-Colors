import type { GameAudio } from "../GameAudio";
import type { GameStore } from "../GameStore";

/** Keep audio muting in step with the sound setting; returns the unsubscribe */
export function bindSoundSetting(store: GameStore, audio: GameAudio): () => void {
	audio.setMuted(!store.getState().settings.soundEnabled);
	return store.subscribe((state, previous) => {
		if (state.settings.soundEnabled !== previous.settings.soundEnabled) {
			audio.setMuted(!state.settings.soundEnabled);
		}
	});
}
