import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";
import { handleGameOver } from "./GameOver";

/**
 * Judge each game over once against the stored personal best (see handleGameOver) and publish
 * the verdict on the store for the game over to show; leaving the game over clears it. A
 * judgement landing after its game over has gone belongs to no screen and is dropped, though
 * the personal best it saved stands. Judgements run one at a time, each against the best the one
 * before it saved. Returns the unsubscribe.
 */
export function bindPersonalBest(store: GameStore, storage: StoragePort): () => void {
	// Counts game overs left behind; a judgement publishes only on the one it was asked on
	let gameOver = 0;
	// The judgement in flight, which the next one waits for
	let previous: Promise<void> = Promise.resolve();
	const judge = (score: number) => {
		const judged = gameOver;
		const judgement = previous
			.then(() => handleGameOver(store, storage, score))
			.then((verdict) => {
				if (judged === gameOver) store.getState().setVerdict(verdict);
			});
		// A failed judgement still reports, but doesn't hold up the next one
		previous = judgement.catch(() => {});
		void judgement;
	};
	const unsubscribe = store.subscribe((state, before) => {
		if (state.frame.phase === before.frame.phase) return;
		if (state.frame.phase === "GAME_OVER") {
			judge(state.frame.score);
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
