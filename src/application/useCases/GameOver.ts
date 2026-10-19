import type { BestVerdict, GameStore } from "../GameStore";
import type { StoragePort } from "../ports";

/**
 * The run is over, and this is the one place a new personal best is decided, once per game over:
 * the score in the final frame beats the stored best or not; the best is saved if new and set on
 * the store either way. The stored best is the one judged against, whether or not the store has
 * loaded it yet. Returns the verdict.
 */
export async function handleGameOver(store: GameStore, storage: StoragePort): Promise<BestVerdict> {
	const score = store.getState().frame.score;
	const highScore = await storage.loadHighScore();
	const newBest = score > highScore;

	if (newBest) {
		await storage.saveHighScore(score);
	}

	const best = Math.max(score, highScore);
	store.getState().setHighScore(best);
	return { best, newBest };
}
