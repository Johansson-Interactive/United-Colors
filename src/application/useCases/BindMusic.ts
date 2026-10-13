import type { GamePhase } from "../../domain/types";
import type { GameStore } from "../GameStore";
import type { GameAudio, MusicCue } from "../ports";

/**
 * Music per phase. Both loops are mastered to the same loudness (-16 LUFS), so the volumes
 * are the mix: the game loop plays near -17 LUFS, a few dB under what music apps play at, so
 * switching over from one needs little if any change of volume. The menu loop plays in full and still sounds
 * calmer than play, its weight being in the bass and pad. Pausing ducks the game loop about
 * 10 dB instead of stopping it; refusing a wrong dot dips it as the game ends; at game over
 * the menu loop comes back 3 dB down, under the stinger (see bindSoundEffects).
 */
export const MUSIC_CUES: Record<GamePhase, MusicCue> = {
	KIOSK: { track: "menu", volume: 1 },
	RUNNING: { track: "game", volume: 0.9 },
	REJECTING: { track: "game", volume: 0.6 },
	PAUSED: { track: "game", volume: 0.27 },
	GAME_OVER: { track: "menu", volume: 0.7 },
};

/** Keep the music in step with the game phase; returns the unsubscribe */
export function bindMusic(store: GameStore, audio: GameAudio): () => void {
	audio.setMusic(MUSIC_CUES[store.getState().frame.phase]);
	return store.subscribe((state, previous) => {
		const phase = state.frame.phase;
		if (phase === previous.frame.phase) return;
		audio.setMusic(MUSIC_CUES[phase]);
	});
}
