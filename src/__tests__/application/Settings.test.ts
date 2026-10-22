import { createGameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { bindSensitivity } from "../../application/useCases/BindSensitivity";
import { loadHighScore } from "../../application/useCases/LoadHighScore";
import { loadSettings } from "../../application/useCases/LoadSettings";
import { updateSettings } from "../../application/useCases/UpdateSettings";
import type { GameSettings } from "../../domain/types";

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
			memoryStorage({
				soundEnabled: false,
				musicEnabled: true,
				tiltSensitivity: 1,
				levelPoses: { up: null, down: null },
			}),
		);
		expect(store.getState().settings.soundEnabled).toBe(false);
	});

	it("updateSettings roundtrips settings through storage", async () => {
		const storage = memoryStorage({
			soundEnabled: true,
			musicEnabled: true,
			tiltSensitivity: 1,
			levelPoses: { up: null, down: null },
		});
		await updateSettings(
			{
				soundEnabled: false,
				musicEnabled: true,
				tiltSensitivity: 1,
				levelPoses: { up: null, down: null },
			},
			createGameStore(),
			storage,
		);
		const store = createGameStore();
		await loadSettings(store, storage);
		expect(store.getState().settings.soundEnabled).toBe(false);
	});

	it("bindSensitivity applies the current sensitivity at once and again when it changes", async () => {
		const store = createGameStore();
		const seen: number[] = [];
		const unbind = bindSensitivity(store, (value) => seen.push(value));
		expect(seen).toEqual([1]);
		store.getState().updateSettings({ soundEnabled: false });
		await updateSettings(
			{ ...store.getState().settings, tiltSensitivity: 1.5 },
			store,
			memoryStorage(store.getState().settings),
		);
		expect(seen).toEqual([1, 1.5]);
		unbind();
		store.getState().updateSettings({ tiltSensitivity: 0.65 });
		expect(seen).toEqual([1, 1.5]);
	});

	it("loadHighScore restores the persisted best into the store", async () => {
		const store = createGameStore();
		await loadHighScore(
			store,
			memoryStorage(
				{
					soundEnabled: true,
					musicEnabled: true,
					tiltSensitivity: 1,
					levelPoses: { up: null, down: null },
				},
				42,
			),
		);
		expect(store.getState().highScore).toBe(42);
	});
});
