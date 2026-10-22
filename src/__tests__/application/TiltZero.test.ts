import { createGameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { bindTiltZero } from "../../application/useCases/BindTiltZero";
import { calibrateTilt } from "../../application/useCases/CalibrateTilt";
import { loadSettings } from "../../application/useCases/LoadSettings";
import { FLAT, type LevelPoses } from "../../domain/levelPose";
import type { GameSettings } from "../../domain/types";

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
		await calibrateTilt({ x: 0.5, y: -0.3, z: -0.8 }, "up", store, storage);
		expect(store.getState().settings).toEqual({
			soundEnabled: false,
			musicEnabled: true,
			tiltSensitivity: 1,
			tiltZero: { x: 0.5, y: -0.3, z: -0.8 },
			tiltZeroDown: null,
		});
	});

	it("a pose set screen down is kept apart from the screen-up one", async () => {
		const store = createGameStore();
		const storage = memoryStorage(UNSET);
		await calibrateTilt({ x: 0.5, y: -0.3, z: -0.8 }, "up", store, storage);
		await calibrateTilt({ x: 0.1, y: 0.2, z: 1 }, "down", store, storage);
		expect(store.getState().settings.tiltZero).toEqual({ x: 0.5, y: -0.3, z: -0.8 });
		expect(store.getState().settings.tiltZeroDown).toEqual({ x: 0.1, y: 0.2, z: 1 });
		const reloaded = createGameStore();
		await loadSettings(reloaded, storage);
		expect(reloaded.getState().settings.tiltZeroDown).toEqual({ x: 0.1, y: 0.2, z: 1 });
	});

	it("the pose survives a reload", async () => {
		const storage = memoryStorage(UNSET);
		await calibrateTilt({ x: 0.5, y: -0.3, z: -0.8 }, "up", createGameStore(), storage);
		const store = createGameStore();
		await loadSettings(store, storage);
		expect(store.getState().settings.tiltZero).toEqual({ x: 0.5, y: -0.3, z: -0.8 });
	});

	it("bindTiltZero applies the current poses at once, flat until set, and again when they change", async () => {
		const store = createGameStore();
		const seen: LevelPoses[] = [];
		const unbind = bindTiltZero(store, (poses) => seen.push(poses));
		expect(seen).toEqual([FLAT]);
		await calibrateTilt({ x: 0.1, y: 0.2, z: 1 }, "up", store, memoryStorage(UNSET));
		store.getState().updateSettings({ soundEnabled: false });
		await calibrateTilt({ x: 0.3, y: 0.4, z: 1 }, "down", store, memoryStorage(UNSET));
		expect(seen).toEqual([
			FLAT,
			{ up: { x: 0.1, y: 0.2, z: 1 }, down: FLAT.down },
			{ up: { x: 0.1, y: 0.2, z: 1 }, down: { x: 0.3, y: 0.4, z: 1 } },
		]);
		unbind();
		await calibrateTilt({ x: 0.5, y: 0.6, z: -1 }, "up", store, memoryStorage(UNSET));
		expect(seen).toHaveLength(3);
	});
});
