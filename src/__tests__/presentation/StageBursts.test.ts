import type { GameEvent } from "../../domain/types";
import { NO_CATCH_SPOT, stepBursts } from "../../presentation/effects/stageBursts";

const PINK = "#E91E63";
/** Combo amber, written out so a change to it shows here */
const AMBER = "#FFC107";
const PLAYER = { x: 120, y: 340, color: PINK };

const collect = (value: number, step: number, sameTick = false): GameEvent => ({
	type: "collect",
	value,
	step,
	sameTick,
});

describe("stage bursts", () => {
	it("pops what a small-dot catch paid at the player, in the player's colour", () => {
		const step = stepBursts(NO_CATCH_SPOT, collect(5, 1), PLAYER);
		expect(step.bursts).toEqual([{ kind: "pop", x: 120, y: 340, text: "5", color: PINK }]);
		expect(step.shake).toBe(false);
	});

	it("pops in combo amber from the second catch of a combo on", () => {
		const step = stepBursts(NO_CATCH_SPOT, collect(3, 2), PLAYER);
		expect(step.bursts).toEqual([{ kind: "pop", x: 120, y: 340, text: "3", color: AMBER }]);
	});

	it("pops a point-dot catch and rings it in the player's colour at the same spot", () => {
		const point: GameEvent = { type: "collectPoint", value: 10, step: 1, sameTick: false };
		expect(stepBursts(NO_CATCH_SPOT, point, PLAYER).bursts).toEqual([
			{ kind: "pop", x: 120, y: 340, text: "10", color: PINK },
			{ kind: "ring", x: 120, y: 340, color: PINK, size: 80 },
		]);
	});

	it("pops a same-tick catch where the catch before it did, and keeps that spot", () => {
		const first = stepBursts(NO_CATCH_SPOT, collect(1, 1), PLAYER);
		const moved = { ...PLAYER, x: 130, y: 350 };
		const second = stepBursts(first.catchSpot, collect(3, 2, true), moved);
		expect(second.bursts).toEqual([{ kind: "pop", x: 120, y: 340, text: "3", color: AMBER }]);
		expect(second.catchSpot).toEqual(first.catchSpot);
	});

	it("rings the game over in white at the player and shakes the stage", () => {
		const last = stepBursts(NO_CATCH_SPOT, collect(1, 1), PLAYER);
		const moved = { ...PLAYER, x: 60, y: 70 };
		const step = stepBursts(last.catchSpot, { type: "gameOver" }, moved);
		expect(step.bursts).toEqual([{ kind: "ring", x: 60, y: 70, color: "#F4F6FB", size: 90 }]);
		expect(step.shake).toBe(true);
	});

	it("shows nothing for a point-dot spawn or the spit", () => {
		for (const event of [{ type: "pointSpawn" }, { type: "spit" }] as const) {
			expect(stepBursts(NO_CATCH_SPOT, event, PLAYER)).toEqual({
				catchSpot: NO_CATCH_SPOT,
				bursts: [],
				shake: false,
				sameTick: false,
			});
		}
	});

	it("cues a same-tick catch after the one before, and everything else in turn", () => {
		const sameTick = (event: GameEvent) => stepBursts(NO_CATCH_SPOT, event, PLAYER).sameTick;
		expect(sameTick(collect(1, 1))).toBe(false);
		expect(sameTick({ type: "collectPoint", value: 10, step: 2, sameTick: true })).toBe(true);
		expect(sameTick({ type: "gameOver" })).toBe(false);
	});
});
