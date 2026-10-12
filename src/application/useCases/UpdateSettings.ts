import type { GameSettings } from "../../domain/types";
import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";

export async function updateSettings(
	settings: GameSettings,
	store: GameStore,
	storage: StoragePort,
): Promise<void> {
	store.getState().updateSettings(settings);
	await storage.saveSettings(settings);
}
