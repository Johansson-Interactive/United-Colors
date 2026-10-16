import type { GamePhase } from "../../domain/types";
import type { GameStore } from "../GameStore";

/**
 * Phases where a run is in play. Play is all tilt and no touch, so a phone would dim its screen
 * and drop to its slow refresh rate mid-run; menus, pause and game over are tapped and left to
 * the system. (The legacy activity kept the screen on throughout with FLAG_KEEP_SCREEN_ON.)
 */
const IN_PLAY_PHASES: Record<GamePhase, boolean> = {
	KIOSK: false,
	RUNNING: true,
	REJECTING: true,
	PAUSED: false,
	GAME_OVER: false,
};

/**
 * Report whether a run is in play: now, then on each change, and `false` on unsubscribe;
 * returns the unsubscribe
 */
export function bindRunInPlay(store: GameStore, onChange: (inPlay: boolean) => void): () => void {
	onChange(IN_PLAY_PHASES[store.getState().frame.phase]);
	const unsubscribe = store.subscribe((state, previous) => {
		const inPlay = IN_PLAY_PHASES[state.frame.phase];
		if (inPlay !== IN_PLAY_PHASES[previous.frame.phase]) onChange(inPlay);
	});
	return () => {
		unsubscribe();
		onChange(false);
	};
}
