import { createGameStore } from "../../application/GameStore";
import { loadSettings } from "../../application/useCases/LoadSettings";
import { updateSettings } from "../../application/useCases/UpdateSettings";
import type { GameSettings, StoragePort } from "../../domain/types";

function memoryStorage(initial: GameSettings): StoragePort {
	let settings = initial;
	return {
		loadHighScore: async () => 0,
		saveHighScore: async () => {},
		loadSettings: async () => settings,
		saveSettings: async (s) => {
			settings = s;
		},
	};
}

describe("settings use cases", () => {
	it("loadSettings restores persisted settings into the store", async () => {
		const store = createGameStore();
		await loadSettings(store, memoryStorage({ soundEnabled: true, gyroSensitivity: 1.5 }));
		expect(store.getState().settings.gyroSensitivity).toBe(1.5);
	});

	it("updateSettings roundtrips settings through storage", async () => {
		const storage = memoryStorage({ soundEnabled: true, gyroSensitivity: 1 });
		await updateSettings({ soundEnabled: true, gyroSensitivity: 2 }, createGameStore(), storage);
		const store = createGameStore();
		await loadSettings(store, storage);
		expect(store.getState().settings.gyroSensitivity).toBe(2);
	});
});
