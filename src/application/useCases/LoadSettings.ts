import type { StoragePort } from "../../domain/types";
import type { GameStore } from "../GameStore";

export async function loadSettings(store: GameStore, storage: StoragePort): Promise<void> {
	const settings = await storage.loadSettings();
	store.getState().updateSettings(settings);
}
