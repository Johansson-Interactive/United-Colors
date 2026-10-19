import { createGameStore, type GameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { bindPersonalBest } from "../../application/useCases/BindPersonalBest";
import type { GamePhase } from "../../domain/types";

/**
 * Storage holding a personal best whose loads wait for the test to release them, oldest first,
 * so each test decides when a judgement lands
 */
function slowStorage(stored: number) {
	const waiting: Array<() => void> = [];
	const saveHighScore = vi.fn(async (score: number) => {
		stored = score;
	});
	const storage: StoragePort = {
		loadHighScore: () =>
			new Promise<number>((resolve) => {
				waiting.push(() => resolve(stored));
			}),
		saveHighScore,
		loadSettings: async () => {
			throw new Error("not used");
		},
		saveSettings: async () => {},
	};
	/** Let the oldest waiting load read the stored best, and the judgement it feeds finish */
	const releaseLoad = async () => {
		waiting.shift()?.();
		await new Promise((resolve) => setTimeout(resolve, 0));
	};
	return { storage, saveHighScore, releaseLoad };
}

function setPhase(store: GameStore, phase: GamePhase, score: number) {
	store.getState().updateFrame({ phase, score, dots: [], events: [] });
}

function setup(stored: number) {
	const store = createGameStore();
	const { storage, saveHighScore, releaseLoad } = slowStorage(stored);
	const unbind = bindPersonalBest(store, storage);
	return { store, saveHighScore, releaseLoad, unbind };
}

describe("bindPersonalBest", () => {
	it("a run that beats the personal best saves it, sets it and publishes a new best", async () => {
		const { store, saveHighScore, releaseLoad } = setup(10);
		setPhase(store, "RUNNING", 0);
		setPhase(store, "GAME_OVER", 12);
		await releaseLoad();
		expect(saveHighScore).toHaveBeenCalledWith(12);
		expect(store.getState().highScore).toBe(12);
		expect(store.getState().verdict).toEqual({ best: 12, newBest: true });
	});

	it("a lower run publishes the personal best to beat and saves nothing", async () => {
		const { store, saveHighScore, releaseLoad } = setup(10);
		store.getState().setHighScore(10);
		setPhase(store, "GAME_OVER", 7);
		await releaseLoad();
		expect(saveHighScore).not.toHaveBeenCalled();
		expect(store.getState().highScore).toBe(10);
		expect(store.getState().verdict).toEqual({ best: 10, newBest: false });
	});

	it("a run ending before the personal best has loaded is judged against the stored one", async () => {
		const { store, saveHighScore, releaseLoad } = setup(50);
		setPhase(store, "GAME_OVER", 30);
		await releaseLoad();
		expect(saveHighScore).not.toHaveBeenCalled();
		expect(store.getState().highScore).toBe(50);
		expect(store.getState().verdict).toEqual({ best: 50, newBest: false });
	});

	it("has no verdict until the judgement lands, and leaving the game over clears it", async () => {
		const { store, releaseLoad } = setup(10);
		setPhase(store, "GAME_OVER", 12);
		expect(store.getState().verdict).toBeNull();
		await releaseLoad();
		expect(store.getState().verdict).toEqual({ best: 12, newBest: true });
		setPhase(store, "RUNNING", 0);
		expect(store.getState().verdict).toBeNull();
	});

	it("drops a judgement landing after a retry has started the next run, but keeps its best", async () => {
		const { store, saveHighScore, releaseLoad } = setup(10);
		setPhase(store, "GAME_OVER", 12);
		setPhase(store, "RUNNING", 0);
		await releaseLoad();
		expect(store.getState().verdict).toBeNull();
		expect(saveHighScore).toHaveBeenCalledWith(12);
		expect(store.getState().highScore).toBe(12);
	});

	it("drops a judgement landing on the next game over; that one gets its own", async () => {
		const { store, releaseLoad } = setup(10);
		setPhase(store, "GAME_OVER", 12);
		setPhase(store, "RUNNING", 0);
		setPhase(store, "GAME_OVER", 3);
		await releaseLoad();
		expect(store.getState().verdict).toBeNull();
		await releaseLoad();
		expect(store.getState().verdict).toEqual({ best: 12, newBest: false });
	});

	it("the first verdict on a game over stands while its frames keep coming", async () => {
		const { store, saveHighScore, releaseLoad } = setup(10);
		setPhase(store, "GAME_OVER", 12);
		await releaseLoad();
		setPhase(store, "GAME_OVER", 40);
		await releaseLoad();
		expect(saveHighScore).toHaveBeenCalledTimes(1);
		expect(store.getState().verdict).toEqual({ best: 12, newBest: true });
	});

	it("stops judging on unsubscribe, dropping a judgement still on its way", async () => {
		const { store, saveHighScore, releaseLoad, unbind } = setup(10);
		setPhase(store, "GAME_OVER", 5);
		unbind();
		await releaseLoad();
		expect(store.getState().verdict).toBeNull();
		setPhase(store, "RUNNING", 0);
		setPhase(store, "GAME_OVER", 12);
		await releaseLoad();
		expect(saveHighScore).not.toHaveBeenCalled();
		expect(store.getState().verdict).toBeNull();
	});
});
