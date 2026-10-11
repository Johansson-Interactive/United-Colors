import { createGameStore, type GameStore } from "../../application/GameStore";
import { REJECT_SPIT_AT } from "../../application/rejection";
import { bindRejectHaptic } from "../../application/useCases/BindRejectHaptic";
import { REJECT_TICKS } from "../../domain/constants";
import type { DotView, GamePhase } from "../../domain/types";

const PLAYER: DotView = {
	id: "p",
	x: 0,
	y: 0,
	radius: 20,
	prevRadius: 20,
	color: "#E91E63",
	kind: "player",
	vx: 0,
	vy: 0,
};

function show(store: GameStore, phase: GamePhase, reject?: number) {
	const refused: DotView[] =
		reject === undefined ? [] : [{ ...PLAYER, id: "r", kind: "small", color: "#2196F3", reject }];
	store.getState().updateFrame({ phase, score: 0, dots: [PLAYER, ...refused] });
}

describe("bindRejectHaptic", () => {
	it("buzzes once, on the tick the refusal crosses the spit", () => {
		const store = createGameStore();
		const spits: number[] = [];
		bindRejectHaptic(store, {
			spit: () => spits.push(store.getState().frame.dots[1].reject ?? -1),
		});
		show(store, "RUNNING");
		for (let t = 0; t <= REJECT_TICKS; t++) show(store, "REJECTING", t / REJECT_TICKS);
		show(store, "GAME_OVER", 1);
		expect(spits).toHaveLength(1);
		expect(spits[0]).toBeGreaterThanOrEqual(REJECT_SPIT_AT);
		expect(spits[0] - 1 / REJECT_TICKS).toBeLessThan(REJECT_SPIT_AT);
	});

	it("stays still through a game with no refusal", () => {
		const store = createGameStore();
		let spits = 0;
		bindRejectHaptic(store, { spit: () => spits++ });
		show(store, "RUNNING");
		show(store, "PAUSED");
		show(store, "KIOSK");
		expect(spits).toBe(0);
	});
});
