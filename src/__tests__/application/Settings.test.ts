import { createGameStore } from "../../application/GameStore";
import { loadHighScore } from "../../application/useCases/LoadHighScore";
import { loadSettings } from "../../application/useCases/LoadSettings";
import { updateSettings } from "../../application/useCases/UpdateSettings";
import type { GameSettings, StoragePort } from "../../domain/types";

function memoryStorage(initial: GameSettings, highScore = 0): StoragePort {
	let settings = initial;
	return {
		loadHighScore: async () => highScore,
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
		await loadSettings(
			store,
			memoryStorage({ soundEnabled: true, gyroSensitivity: 1.5, tiltZero: null }),
		);
		expect(store.getState().settings.gyroSensitivity).toBe(1.5);
	});

	it("updateSettings roundtrips settings through storage", async () => {
		const storage = memoryStorage({ soundEnabled: true, gyroSensitivity: 1, tiltZero: null });
		await updateSettings(
			{ soundEnabled: true, gyroSensitivity: 2, tiltZero: null },
			createGameStore(),
			storage,
		);
		const store = createGameStore();
		await loadSettings(store, storage);
		expect(store.getState().settings.gyroSensitivity).toBe(2);
	});

	it("loadHighScore restores the persisted best into the store", async () => {
		const store = createGameStore();
		await loadHighScore(
			store,
			memoryStorage({ soundEnabled: true, gyroSensitivity: 1, tiltZero: null }, 42),
		);
		expect(store.getState().highScore).toBe(42);
	});
});
