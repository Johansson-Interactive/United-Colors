import { createGameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { bindTiltZero } from "../../application/useCases/BindTiltZero";
import { calibrateTilt } from "../../application/useCases/CalibrateTilt";
import { loadSettings } from "../../application/useCases/LoadSettings";
import type { GameSettings, TiltZero } from "../../domain/types";

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

const UNSET: GameSettings = {
	soundEnabled: true,
	musicEnabled: true,
	tiltSensitivity: 1,
	tiltZero: null,
	tiltZeroDown: null,
};

describe("tilt zero", () => {
	it("calibrateTilt stores the pose and keeps the other settings", async () => {
		const store = createGameStore();
		const storage = memoryStorage({ ...UNSET, soundEnabled: false });
		await loadSettings(store, storage);
		await calibrateTilt({ x: 0.5, y: -0.3 }, store, storage);
		expect(store.getState().settings).toEqual({
			soundEnabled: false,
			musicEnabled: true,
			tiltSensitivity: 1,
			tiltZero: { x: 0.5, y: -0.3 },
			tiltZeroDown: null,
		});
	});

	it("a pose set screen down is kept apart from the screen-up one", async () => {
		const store = createGameStore();
		const storage = memoryStorage(UNSET);
		await calibrateTilt({ x: 0.5, y: -0.3 }, store, storage);
		await calibrateTilt({ x: 0.1, y: 0.2 }, store, storage, true);
		expect(store.getState().settings.tiltZero).toEqual({ x: 0.5, y: -0.3 });
		expect(store.getState().settings.tiltZeroDown).toEqual({ x: 0.1, y: 0.2 });
		const reloaded = createGameStore();
		await loadSettings(reloaded, storage);
		expect(reloaded.getState().settings.tiltZeroDown).toEqual({ x: 0.1, y: 0.2 });
	});

	it("the pose survives a reload", async () => {
		const storage = memoryStorage(UNSET);
		await calibrateTilt({ x: 0.5, y: -0.3 }, createGameStore(), storage);
		const store = createGameStore();
		await loadSettings(store, storage);
		expect(store.getState().settings.tiltZero).toEqual({ x: 0.5, y: -0.3 });
	});

	it("bindTiltZero applies the current pose at once and again when it changes", async () => {
		const store = createGameStore();
		const seen: [TiltZero | null, TiltZero | null][] = [];
		const unbind = bindTiltZero(store, (zero, zeroDown) => seen.push([zero, zeroDown]));
		expect(seen).toEqual([[null, null]]);
		await calibrateTilt({ x: 0.1, y: 0.2 }, store, memoryStorage(UNSET));
		store.getState().updateSettings({ soundEnabled: false });
		await calibrateTilt({ x: 0.3, y: 0.4 }, store, memoryStorage(UNSET), true);
		expect(seen).toEqual([
			[null, null],
			[{ x: 0.1, y: 0.2 }, null],
			[
				{ x: 0.1, y: 0.2 },
				{ x: 0.3, y: 0.4 },
			],
		]);
		unbind();
		await calibrateTilt({ x: 0.5, y: 0.6 }, store, memoryStorage(UNSET));
		expect(seen).toHaveLength(3);
	});
});
