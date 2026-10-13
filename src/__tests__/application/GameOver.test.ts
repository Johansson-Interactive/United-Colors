import { createGameStore, type GameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { handleGameOver } from "../../application/useCases/GameOver";
import { loadHighScore } from "../../application/useCases/LoadHighScore";

function fakeStorage(highScore: number) {
	const saveHighScore = vi.fn(async (score: number) => {
		highScore = score;
	});
	const storage: StoragePort = {
		loadHighScore: async () => highScore,
		saveHighScore,
		loadSettings: async () => {
			throw new Error("not used");
		},
		saveSettings: async () => {},
	};
	return { storage, saveHighScore };
}

function endWithScore(store: GameStore, score: number) {
	store.getState().updateFrame({ phase: "GAME_OVER", score, dots: [], events: [] });
}

describe("handleGameOver", () => {
	it("saves a score that beats the stored best and sets it on the store", async () => {
		const store = createGameStore();
		const { storage, saveHighScore } = fakeStorage(10);
		endWithScore(store, 12);
		const result = await handleGameOver(store, storage);
		expect(saveHighScore).toHaveBeenCalledWith(12);
		expect(store.getState().highScore).toBe(12);
		expect(result).toEqual({ best: 12, newBest: true });
	});

	it("keeps the stored best when the score is lower, but still sets the store", async () => {
		const store = createGameStore();
		const { storage, saveHighScore } = fakeStorage(10);
		endWithScore(store, 7);
		const result = await handleGameOver(store, storage);
		expect(saveHighScore).not.toHaveBeenCalled();
		expect(store.getState().highScore).toBe(10);
		expect(result).toEqual({ best: 10, newBest: false });
	});

	it("does not rewrite an equal score", async () => {
		const store = createGameStore();
		const { storage, saveHighScore } = fakeStorage(10);
		endWithScore(store, 10);
		const result = await handleGameOver(store, storage);
		expect(saveHighScore).not.toHaveBeenCalled();
		expect(result).toEqual({ best: 10, newBest: false });
		expect(store.getState().highScore).toBe(10);
	});

	it("reads the best from storage rather than the store", async () => {
		const store = createGameStore();
		store.getState().setHighScore(99);
		const { storage } = fakeStorage(10);
		endWithScore(store, 12);
		await handleGameOver(store, storage);
		expect(store.getState().highScore).toBe(12);
	});

	it("judges against the stored best even before the store has loaded it", async () => {
		// The title's best loads asynchronously; a quick first run can end before it lands
		const store = createGameStore();
		const { storage, saveHighScore } = fakeStorage(50);
		endWithScore(store, 30);
		const result = await handleGameOver(store, storage);
		expect(result).toEqual({ best: 50, newBest: false });
		expect(saveHighScore).not.toHaveBeenCalled();
		expect(store.getState().highScore).toBe(50);
	});
});

describe("loadHighScore", () => {
	it("a best loading after the game over does not lower the new one", async () => {
		const store = createGameStore();
		let releaseLoad: (best: number) => void = () => {};
		const storage: StoragePort = {
			...fakeStorage(10).storage,
			loadHighScore: () =>
				new Promise<number>((resolve) => {
					releaseLoad = resolve;
				}),
		};
		const loading = loadHighScore(store, storage);
		store.getState().setHighScore(25);
		releaseLoad(10);
		await loading;
		expect(store.getState().highScore).toBe(25);
	});
});
