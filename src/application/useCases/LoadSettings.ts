import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";

export async function loadSettings(store: GameStore, storage: StoragePort): Promise<void> {
	const settings = await storage.loadSettings();
	store.getState().updateSettings(settings);
}
