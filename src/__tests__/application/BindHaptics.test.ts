import { createGameStore, type GameStore } from "../../application/GameStore";
import { bindHaptics } from "../../application/useCases/BindHaptics";
import type { GameEvent } from "../../domain/types";

function report(store: GameStore, events: GameEvent[]) {
	store.getState().updateFrame({ phase: "REJECTING", score: 0, dots: [], events });
}

describe("bindHaptics", () => {
	it("buzzes once as the player spits the refused dot out", () => {
		const store = createGameStore();
		let spits = 0;
		bindHaptics(store, { spit: () => spits++ });
		report(store, [{ type: "collect", value: 1 }]);
		report(store, []);
		report(store, [{ type: "spit" }]);
		report(store, [{ type: "gameOver" }]);
		expect(spits).toBe(1);
	});

	it("stops after unsubscribe", () => {
		const store = createGameStore();
		let spits = 0;
		bindHaptics(store, { spit: () => spits++ })();
		report(store, [{ type: "spit" }]);
		expect(spits).toBe(0);
	});
});
