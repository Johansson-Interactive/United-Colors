import { CATCH_STAGGER_MS } from "../../application/catchCue";
import { createGameStore, type GameStore } from "../../application/GameStore";
import type { GameAudio } from "../../application/ports";
import { bindSoundEffects } from "../../application/useCases/BindSoundEffects";
import type { Catch, GameEvent } from "../../domain/types";

function fakeAudio() {
	const calls: string[] = [];
	const audio: GameAudio = {
		load: async () => {},
		dispose: () => {},
		playCollect: (pitch) => calls.push(`collect ${pitch}`),
		playLargeCollect: (pitch) => calls.push(`large ${pitch}`),
		playPointSpawn: () => calls.push("spawn"),
		playGameOver: () => calls.push("gameOver"),
		setMusic: () => {},
		setEffectsMuted: () => {},
		setMusicMuted: () => {},
	};
	return { audio, calls };
}

/** A catch alone or first in its combo, unless the test says otherwise */
function caught(value: number, step = 1, sameTick = false): Catch {
	return { value, step, sameTick };
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
		report(store, [{ type: "collect", ...caught(1) }]);
		report(store, [{ type: "collectPoint", ...caught(5) }]);
		report(store, [{ type: "spit" }]);
		report(store, [{ type: "gameOver" }]);
		expect(calls).toEqual(["spawn", "collect 0", "large 0", "gameOver"]);
	});

	it("each step of a combo sounds a semitone higher, the point-dot sound too", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindSoundEffects(store, audio);
		report(store, [{ type: "collect", ...caught(1, 1) }]);
		report(store, [{ type: "collect", ...caught(2, 2) }]);
		report(store, [{ type: "collectPoint", ...caught(7, 3) }]);
		report(store, [{ type: "collect", ...caught(20, 20) }]);
		expect(calls).toEqual(["collect 0", "collect 1", "large 2", "collect 12"]);
	});

	describe("catches on the same tick", () => {
		beforeEach(() => vi.useFakeTimers());
		afterEach(() => vi.useRealTimers());

		it("sound CATCH_STAGGER_MS apart", () => {
			const store = createGameStore();
			const { audio, calls } = fakeAudio();
			bindSoundEffects(store, audio);
			report(store, [
				{ type: "collect", ...caught(1, 1) },
				{ type: "collectPoint", ...caught(6, 2, true) },
			]);
			expect(calls).toEqual(["collect 0"]);
			vi.advanceTimersByTime(CATCH_STAGGER_MS);
			expect(calls).toEqual(["collect 0", "large 1"]);
		});

		it("held back sounds are dropped on unsubscribe", () => {
			const store = createGameStore();
			const { audio, calls } = fakeAudio();
			const unbind = bindSoundEffects(store, audio);
			report(store, [
				{ type: "collect", ...caught(1, 1) },
				{ type: "collect", ...caught(2, 2, true) },
			]);
			unbind();
			vi.advanceTimersByTime(CATCH_STAGGER_MS);
			expect(calls).toEqual(["collect 0"]);
		});
	});

	it("stops after unsubscribe", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindSoundEffects(store, audio)();
		report(store, [{ type: "collect", ...caught(1) }]);
		expect(calls).toEqual([]);
	});
});
