import { createGameStore, type GameStore } from "../../application/GameStore";
import type { GameAudio } from "../../application/ports";
import { bindSoundEffects } from "../../application/useCases/BindSoundEffects";
import type { GameEvent } from "../../domain/types";

function fakeAudio() {
	const calls: string[] = [];
	const audio: GameAudio = {
		load: async () => {},
		dispose: () => {},
		playCollect: () => calls.push("collect"),
		playLargeCollect: () => calls.push("large"),
		playPointSpawn: () => calls.push("spawn"),
		playGameOver: () => calls.push("gameOver"),
		setMusic: () => {},
		setEffectsMuted: () => {},
		setMusicMuted: () => {},
	};
	return { audio, calls };
}

function report(store: GameStore, events: GameEvent[]) {
	store.getState().updateFrame({ phase: "RUNNING", score: 0, dots: [], events });
}

describe("bindSoundEffects", () => {
	it("plays a sound for each catch, spawn and the game over; the spit is silent", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindSoundEffects(store, audio);
		report(store, [{ type: "pointSpawn" }]);
		report(store, [
			{ type: "collect", value: 1 },
			{ type: "collect", value: 1 },
		]);
		report(store, [{ type: "collectPoint", value: 5 }]);
		report(store, [{ type: "spit" }]);
		report(store, [{ type: "gameOver" }]);
		expect(calls).toEqual(["spawn", "collect", "collect", "large", "gameOver"]);
	});

	it("stops after unsubscribe", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindSoundEffects(store, audio)();
		report(store, [{ type: "collect", value: 1 }]);
		expect(calls).toEqual([]);
	});
});
