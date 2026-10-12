import { createGameStore, type GameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { handleGameOver } from "../../application/useCases/GameOver";

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
		expect(result).toBe(12);
	});

	it("keeps the stored best when the score is lower, but still sets the store", async () => {
		const store = createGameStore();
		const { storage, saveHighScore } = fakeStorage(10);
		endWithScore(store, 7);
		const result = await handleGameOver(store, storage);
		expect(saveHighScore).not.toHaveBeenCalled();
		expect(store.getState().highScore).toBe(10);
		expect(result).toBe(10);
	});

	it("does not rewrite an equal score", async () => {
		const store = createGameStore();
		const { storage, saveHighScore } = fakeStorage(10);
		endWithScore(store, 10);
		await handleGameOver(store, storage);
		expect(saveHighScore).not.toHaveBeenCalled();
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
});
