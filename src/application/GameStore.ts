import { createStore } from "zustand/vanilla";
import { DEFAULT_SETTINGS } from "../domain/constants";
import type { GameSettings, RenderFrame } from "../domain/types";

/** How a finished run stands against the personal best */
export interface BestVerdict {
	/** The personal best after this run */
	best: number;
	/** The run's score beat the stored personal best */
	newBest: boolean;
	/** The personal best before this run, the one it was judged against */
	previous: number;
}

export interface GameStoreState {
	frame: RenderFrame;
	/** The personal best */
	highScore: number;
	/** How the run over stands against the personal best, once judged; null outside game over */
	verdict: BestVerdict | null;
	settings: GameSettings;
	updateFrame: (frame: RenderFrame) => void;
	setHighScore: (score: number) => void;
	setVerdict: (verdict: BestVerdict | null) => void;
	updateSettings: (patch: Partial<GameSettings>) => void;
}

const DEFAULT_FRAME: RenderFrame = {
	phase: "KIOSK",
	score: 0,
	dots: [],
	events: [],
	runTicks: 0,
};

export function createGameStore() {
	return createStore<GameStoreState>((set) => ({
		frame: DEFAULT_FRAME,
		highScore: 0,
		verdict: null,
		settings: { ...DEFAULT_SETTINGS },

		updateFrame: (frame) => set({ frame }),

		setHighScore: (highScore) => set({ highScore }),

		setVerdict: (verdict) => set({ verdict }),

		updateSettings: (patch) =>
			set((state) => ({
				settings: { ...state.settings, ...patch },
			})),
	}));
}

export type GameStore = ReturnType<typeof createGameStore>;
