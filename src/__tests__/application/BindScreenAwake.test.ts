import { createGameStore } from "../../application/GameStore";
import { bindScreenAwake } from "../../application/useCases/BindScreenAwake";
import type { GamePhase } from "../../domain/types";

function setup(phase: GamePhase) {
	const store = createGameStore();
	const setPhase = (next: GamePhase) =>
		store.setState((s) => ({ frame: { ...s.frame, phase: next } }));
	setPhase(phase);
	const calls: boolean[] = [];
	const unbind = bindScreenAwake(store, { setAwake: (awake) => calls.push(awake) });
	return { setPhase, unbind, calls };
}

describe("bindScreenAwake", () => {
	it.each<[GamePhase, boolean]>([
		["KIOSK", false],
		["RUNNING", true],
		["REJECTING", true],
		["PAUSED", false],
		["GAME_OVER", false],
	])("starts in %s with awake %s", (phase, awake) => {
		expect(setup(phase).calls).toEqual([awake]);
	});

	it("keeps the screen on when a run starts and lets it dim at game over", () => {
		const { setPhase, calls } = setup("KIOSK");
		setPhase("RUNNING");
		setPhase("REJECTING");
		setPhase("GAME_OVER");
		expect(calls).toEqual([false, true, false]);
	});

	it("lets the screen dim while paused and holds it again on resume", () => {
		const { setPhase, calls } = setup("RUNNING");
		setPhase("PAUSED");
		setPhase("RUNNING");
		expect(calls).toEqual([true, false, true]);
	});

	it("releases the screen on unsubscribe and stops following the phase", () => {
		const { setPhase, unbind, calls } = setup("RUNNING");
		unbind();
		setPhase("KIOSK");
		setPhase("RUNNING");
		expect(calls).toEqual([true, false]);
	});
});
