import { createGameStore, type GameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { bindPersonalBest } from "../../application/useCases/BindPersonalBest";
import type { GamePhase } from "../../domain/types";

/**
 * Storage holding a personal best. A load reads the best when it is called, then waits for the
 * test to release it, oldest first, so each test decides when a judgement lands.
 */
function slowStorage(stored: number) {
	const waiting: Array<() => void> = [];
	const saveHighScore = vi.fn(async (score: number) => {
		stored = score;
	});
	const storage: StoragePort = {
		loadHighScore: () => {
			const read = stored;
			return new Promise<number>((resolve) => {
				waiting.push(() => resolve(read));
			});
		},
		saveHighScore,
		loadSettings: async () => {
			throw new Error("not used");
		},
		saveSettings: async () => {},
	};
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	/** Let the oldest load asked for land, and the judgement it feeds finish */
	const releaseLoad = async () => {
		await settle();
		waiting.shift()?.();
		await settle();
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
		expect(store.getState().verdict).toEqual({ best: 12, newBest: true, previous: 10 });
	});

	it("a lower run publishes the personal best to beat and saves nothing", async () => {
		const { store, saveHighScore, releaseLoad } = setup(10);
		store.getState().setHighScore(10);
		setPhase(store, "GAME_OVER", 7);
		await releaseLoad();
		expect(saveHighScore).not.toHaveBeenCalled();
		expect(store.getState().highScore).toBe(10);
		expect(store.getState().verdict).toEqual({ best: 10, newBest: false, previous: 10 });
	});

	it("a run ending before the personal best has loaded is judged against the stored one", async () => {
		const { store, saveHighScore, releaseLoad } = setup(50);
		setPhase(store, "GAME_OVER", 30);
		await releaseLoad();
		expect(saveHighScore).not.toHaveBeenCalled();
		expect(store.getState().highScore).toBe(50);
		expect(store.getState().verdict).toEqual({ best: 50, newBest: false, previous: 50 });
	});

	it("has no verdict until the judgement lands, and leaving the game over clears it", async () => {
		const { store, releaseLoad } = setup(10);
		setPhase(store, "GAME_OVER", 12);
		expect(store.getState().verdict).toBeNull();
		await releaseLoad();
		expect(store.getState().verdict).toEqual({ best: 12, newBest: true, previous: 10 });
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
		expect(store.getState().verdict).toEqual({ best: 12, newBest: false, previous: 12 });
	});

	it("judges a game over against the best the one before it saved", async () => {
		const { store, saveHighScore, releaseLoad } = setup(10);
		setPhase(store, "GAME_OVER", 12);
		setPhase(store, "RUNNING", 0);
		setPhase(store, "GAME_OVER", 11);
		await releaseLoad();
		await releaseLoad();
		expect(saveHighScore.mock.calls).toEqual([[12]]);
		expect(store.getState().highScore).toBe(12);
		expect(store.getState().verdict).toEqual({ best: 12, newBest: false, previous: 12 });
	});

	it("a game over waiting its turn is judged on the score it ended with", async () => {
		const { store, saveHighScore, releaseLoad } = setup(10);
		setPhase(store, "GAME_OVER", 12);
		setPhase(store, "RUNNING", 0);
		setPhase(store, "GAME_OVER", 11);
		setPhase(store, "GAME_OVER", 40);
		await releaseLoad();
		await releaseLoad();
		expect(saveHighScore.mock.calls).toEqual([[12]]);
		expect(store.getState().verdict).toEqual({ best: 12, newBest: false, previous: 12 });
	});

	it("the first verdict on a game over stands while its frames keep coming", async () => {
		const { store, saveHighScore, releaseLoad } = setup(10);
		setPhase(store, "GAME_OVER", 12);
		await releaseLoad();
		setPhase(store, "GAME_OVER", 40);
		await releaseLoad();
		expect(saveHighScore).toHaveBeenCalledTimes(1);
		expect(store.getState().verdict).toEqual({ best: 12, newBest: true, previous: 10 });
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
