import type { GamePhase } from "../../domain/types";
import type { GameStore } from "../GameStore";
import type { GameAudio, MusicCue } from "../ports";

/**
 * Music per phase. The menu loop is calmer and quieter than play; pausing ducks the game
 * loop instead of stopping it; refusing a wrong dot dips it as the game ends; at game over
 * the menu loop fades back in (under the stinger, see bindSoundEffects).
 */
export const MUSIC_CUES: Record<GamePhase, MusicCue> = {
	KIOSK: { track: "menu", volume: 0.5 },
	RUNNING: { track: "game", volume: 0.6 },
	REJECTING: { track: "game", volume: 0.4 },
	PAUSED: { track: "game", volume: 0.18 },
	GAME_OVER: { track: "menu", volume: 0.35 },
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
