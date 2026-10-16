import { createGameStore } from "../../application/GameStore";
import { bindRunInPlay } from "../../application/useCases/BindRunInPlay";
import type { GamePhase } from "../../domain/types";

function setup(phase: GamePhase) {
	const store = createGameStore();
	const setPhase = (next: GamePhase) =>
		store.setState((s) => ({ frame: { ...s.frame, phase: next } }));
	setPhase(phase);
	const calls: boolean[] = [];
	const unbind = bindRunInPlay(store, (inPlay) => calls.push(inPlay));
	return { setPhase, unbind, calls };
}

describe("bindRunInPlay", () => {
	it.each<[GamePhase, boolean]>([
		["KIOSK", false],
		["RUNNING", true],
		["REJECTING", true],
		["PAUSED", false],
		["GAME_OVER", false],
	])("starts in %s with in play %s", (phase, inPlay) => {
		expect(setup(phase).calls).toEqual([inPlay]);
	});

	it("reports play when a run starts and stops at game over, not on each rejection", () => {
		const { setPhase, calls } = setup("KIOSK");
		setPhase("RUNNING");
		setPhase("REJECTING");
		setPhase("RUNNING");
		setPhase("GAME_OVER");
		expect(calls).toEqual([false, true, false]);
	});

	it("stops while paused and reports play again on resume", () => {
		const { setPhase, calls } = setup("RUNNING");
		setPhase("PAUSED");
		setPhase("RUNNING");
		expect(calls).toEqual([true, false, true]);
	});

	it("stops on unsubscribe and no longer follows the phase", () => {
		const { setPhase, unbind, calls } = setup("RUNNING");
		unbind();
		setPhase("KIOSK");
		setPhase("RUNNING");
		expect(calls).toEqual([true, false]);
	});
});
