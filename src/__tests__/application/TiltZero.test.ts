import { createGameStore } from "../../application/GameStore";
import { bindTiltZero } from "../../application/useCases/BindTiltZero";
import { calibrateTilt } from "../../application/useCases/CalibrateTilt";
import { loadSettings } from "../../application/useCases/LoadSettings";
import type { GameSettings, StoragePort, TiltZero } from "../../domain/types";

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

const UNSET: GameSettings = { soundEnabled: true, gyroSensitivity: 1, tiltZero: null };

describe("tilt zero", () => {
	it("calibrateTilt stores the pose and keeps the other settings", async () => {
		const store = createGameStore();
		const storage = memoryStorage({ ...UNSET, soundEnabled: false });
		await loadSettings(store, storage);
		await calibrateTilt({ x: 0.5, y: -0.3 }, store, storage);
		expect(store.getState().settings).toEqual({
			soundEnabled: false,
			gyroSensitivity: 1,
			tiltZero: { x: 0.5, y: -0.3 },
		});
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
		const seen: (TiltZero | null)[] = [];
		const unbind = bindTiltZero(store, (zero) => seen.push(zero));
		expect(seen).toEqual([null]);
		await calibrateTilt({ x: 0.1, y: 0.2 }, store, memoryStorage(UNSET));
		store.getState().updateSettings({ soundEnabled: false });
		expect(seen).toEqual([null, { x: 0.1, y: 0.2 }]);
		unbind();
		await calibrateTilt({ x: 0.3, y: 0.4 }, store, memoryStorage(UNSET));
		expect(seen).toHaveLength(2);
	});
});
