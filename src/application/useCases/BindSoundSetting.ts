import type { GameStore } from "../GameStore";
import type { GameAudio } from "../ports";

/** Keep effect and music muting in step with their settings; returns the unsubscribe */
export function bindSoundSetting(store: GameStore, audio: GameAudio): () => void {
	const { soundEnabled, musicEnabled } = store.getState().settings;
	audio.setEffectsMuted(!soundEnabled);
	audio.setMusicMuted(!musicEnabled);
	return store.subscribe((state, previous) => {
		if (state.settings.soundEnabled !== previous.settings.soundEnabled) {
			audio.setEffectsMuted(!state.settings.soundEnabled);
		}
		if (state.settings.musicEnabled !== previous.settings.musicEnabled) {
			audio.setMusicMuted(!state.settings.musicEnabled);
		}
	});
}
