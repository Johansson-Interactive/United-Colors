import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";

export async function loadHighScore(store: GameStore, storage: StoragePort): Promise<void> {
	const highScore = await storage.loadHighScore();
	store.getState().setHighScore(highScore);
}
