import type { StoragePort } from "../../domain/types";
import type { GameStore } from "../GameStore";

export async function loadHighScore(store: GameStore, storage: StoragePort): Promise<void> {
	const highScore = await storage.loadHighScore();
	store.getState().setHighScore(highScore);
}
