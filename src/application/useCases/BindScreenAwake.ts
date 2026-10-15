import type { GamePhase } from "../../domain/types";
import type { GameStore } from "../GameStore";
import type { ScreenAwake } from "../ports";

/**
 * Phases that keep the screen on. Play is all tilt and no touch, so the display would dim
 * mid-run; menus, pause and game over may dim as usual. (The legacy activity kept the screen
 * on throughout with FLAG_KEEP_SCREEN_ON.)
 */
const AWAKE_PHASES: Record<GamePhase, boolean> = {
	KIOSK: false,
	RUNNING: true,
	REJECTING: true,
	PAUSED: false,
	GAME_OVER: false,
};

/** Keep the screen on while a run is in play; returns the unsubscribe, which lets it sleep */
export function bindScreenAwake(store: GameStore, screen: ScreenAwake): () => void {
	screen.setAwake(AWAKE_PHASES[store.getState().frame.phase]);
	const unsubscribe = store.subscribe((state, previous) => {
		const awake = AWAKE_PHASES[state.frame.phase];
		if (awake !== AWAKE_PHASES[previous.frame.phase]) screen.setAwake(awake);
	});
	return () => {
		unsubscribe();
		screen.setAwake(false);
	};
}
