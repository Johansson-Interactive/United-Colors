import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";

/** Restore the persisted best; a best set while it loaded (a run that ended first) is newer */
export async function loadHighScore(store: GameStore, storage: StoragePort): Promise<void> {
	const highScore = await storage.loadHighScore();
	store.getState().setHighScore(Math.max(store.getState().highScore, highScore));
}
