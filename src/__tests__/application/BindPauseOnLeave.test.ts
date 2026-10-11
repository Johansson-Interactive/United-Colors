import { createGameStore } from "../../application/GameStore";
import { bindPauseOnLeave } from "../../application/useCases/BindPauseOnLeave";
import type { GamePhase } from "../../domain/types";

function fakeAppState() {
	let listener: ((active: boolean) => void) | null = null;
	return {
		watch: (next: (active: boolean) => void) => {
			listener = next;
			return () => {
				listener = null;
			};
		},
		set: (active: boolean) => listener?.(active),
	};
}

function setup(phase: GamePhase) {
	const store = createGameStore();
	store.setState((s) => ({ frame: { ...s.frame, phase } }));
	const app = fakeAppState();
	let pauses = 0;
	const unbind = bindPauseOnLeave(store, app.watch, () => pauses++);
	return { store, app, unbind, pauses: () => pauses };
}

describe("bindPauseOnLeave", () => {
	it("pauses a running game when the app leaves the foreground", () => {
		const { app, pauses } = setup("RUNNING");
		app.set(false);
		expect(pauses()).toBe(1);
	});

	it("does not resume or pause again when the app comes back", () => {
		const { app, pauses } = setup("RUNNING");
		app.set(true);
		expect(pauses()).toBe(0);
	});

	it.each<GamePhase>(["KIOSK", "PAUSED", "GAME_OVER"])("leaves %s alone", (phase) => {
		const { app, pauses } = setup(phase);
		app.set(false);
		expect(pauses()).toBe(0);
	});

	it("stops watching after unsubscribe", () => {
		const { app, unbind, pauses } = setup("RUNNING");
		unbind();
		app.set(false);
		expect(pauses()).toBe(0);
	});
});
