import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";

/**
 * The run is over: the score in the final frame beats the stored best or not; the best is
 * saved if new and set on the store either way. Returns the best.
 */
export async function handleGameOver(store: GameStore, storage: StoragePort): Promise<number> {
	const score = store.getState().frame.score;
	const highScore = await storage.loadHighScore();
	const newHigh = Math.max(score, highScore);

	if (score > highScore) {
		await storage.saveHighScore(score);
	}

	store.getState().setHighScore(newHigh);
	return newHigh;
}
