import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";
import { handleGameOver } from "./GameOver";

/**
 * Judge each game over once against the stored personal best (see handleGameOver) and publish
 * the verdict on the store for the game over to show; leaving the game over clears it. A
 * judgement landing after its game over has gone belongs to no screen and is dropped, though
 * the personal best it saved stands. Returns the unsubscribe.
 */
export function bindPersonalBest(store: GameStore, storage: StoragePort): () => void {
	// Counts game overs left behind; a judgement publishes only on the one it was asked on
	let gameOver = 0;
	const judge = () => {
		const judged = gameOver;
		void handleGameOver(store, storage).then((verdict) => {
			if (judged === gameOver) store.getState().setVerdict(verdict);
		});
	};
	const unsubscribe = store.subscribe((state, previous) => {
		if (state.frame.phase === previous.frame.phase) return;
		if (state.frame.phase === "GAME_OVER") {
			judge();
			return;
		}
		gameOver += 1;
		if (state.verdict) state.setVerdict(null);
	});
	return () => {
		unsubscribe();
		gameOver += 1;
	};
}
