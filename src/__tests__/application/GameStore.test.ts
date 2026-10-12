import { createGameStore } from "../../application/GameStore";
import { DEFAULT_SETTINGS } from "../../domain/constants";

describe("GameStore", () => {
	it("starts in the kiosk with no score, no dots, no best and default settings", () => {
		const state = createGameStore().getState();
		expect(state.frame).toEqual({ phase: "KIOSK", score: 0, dots: [], events: [] });
		expect(state.highScore).toBe(0);
		expect(state.settings).toEqual(DEFAULT_SETTINGS);
	});

	it("updateSettings merges a patch and keeps the rest", () => {
		const store = createGameStore();
		store.getState().updateSettings({ tiltZero: { x: 0.1, y: 0.2 } });
		store.getState().updateSettings({ soundEnabled: false });
		expect(store.getState().settings).toEqual({
			soundEnabled: false,
			musicEnabled: true,
			tiltSensitivity: 1,
			tiltZero: { x: 0.1, y: 0.2 },
			tiltZeroDown: null,
		});
	});

	it("updateSettings does not mutate the previous settings object", () => {
		const store = createGameStore();
		const before = store.getState().settings;
		store.getState().updateSettings({ musicEnabled: false });
		expect(before.musicEnabled).toBe(true);
		expect(store.getState().settings).not.toBe(before);
	});

	it("each store has its own settings", () => {
		const a = createGameStore();
		const b = createGameStore();
		a.getState().updateSettings({ soundEnabled: false });
		expect(b.getState().settings.soundEnabled).toBe(true);
		expect(DEFAULT_SETTINGS.soundEnabled).toBe(true);
	});

	it("updateFrame and setHighScore replace their slices", () => {
		const store = createGameStore();
		const frame = { phase: "RUNNING" as const, score: 3, dots: [], events: [] };
		store.getState().updateFrame(frame);
		store.getState().setHighScore(8);
		expect(store.getState().frame).toBe(frame);
		expect(store.getState().highScore).toBe(8);
	});
});
