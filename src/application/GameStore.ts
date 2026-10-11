import { createStore } from "zustand/vanilla";
import type { GameSettings, RenderFrame } from "../domain/types";

export interface GameStoreState {
	frame: RenderFrame;
	highScore: number;
	settings: GameSettings;
	updateFrame: (frame: RenderFrame) => void;
	setHighScore: (score: number) => void;
	updateSettings: (patch: Partial<GameSettings>) => void;
}

const DEFAULT_SETTINGS: GameSettings = {
	soundEnabled: true,
	musicEnabled: true,
	tiltZero: null,
	tiltZeroDown: null,
};

const DEFAULT_FRAME: RenderFrame = {
	phase: "KIOSK",
	score: 0,
	dots: [],
};

export function createGameStore() {
	return createStore<GameStoreState>((set) => ({
		frame: DEFAULT_FRAME,
		highScore: 0,
		settings: { ...DEFAULT_SETTINGS },

		updateFrame: (frame) => set({ frame }),

		setHighScore: (highScore) => set({ highScore }),

		updateSettings: (patch) =>
			set((state) => ({
				settings: { ...state.settings, ...patch },
			})),
	}));
}

export type GameStore = ReturnType<typeof createGameStore>;
