import type { GameEvent } from "../../domain/types";
import { NO_CATCH_SPOT, stepBursts } from "../../presentation/effects/stageBursts";
import { COMBO_AMBER } from "../../presentation/theme/theme";

const PINK = "#E91E63";
const PLAYER = { x: 120, y: 340, color: PINK };

const collect = (value: number, step: number, sameTick = false): GameEvent => ({
	type: "collect",
	value,
	step,
	sameTick,
});

describe("stage bursts", () => {
	it("shows nothing where a small-dot catch landed: the score counts it in at the top", () => {
		const step = stepBursts(NO_CATCH_SPOT, collect(5, 1), PLAYER);
		expect(step.bursts).toEqual([]);
		expect(step.shake).toBe(false);
		expect(step.catchSpot).toEqual({ x: 120, y: 340 });
	});

	it("rings a point-dot catch in the player's colour where it landed", () => {
		const point: GameEvent = { type: "collectPoint", value: 10, step: 1, sameTick: false };
		expect(stepBursts(NO_CATCH_SPOT, point, PLAYER).bursts).toEqual([
			{ kind: "ring", x: 120, y: 340, color: PINK, size: 80 },
		]);
	});

	it("rings a small-dot catch that carries a combo on, small and in amber, where it landed", () => {
		const amber = [{ kind: "ring", x: 120, y: 340, color: COMBO_AMBER, size: 28 }];
		expect(stepBursts(NO_CATCH_SPOT, collect(3, 2), PLAYER).bursts).toEqual(amber);
		expect(stepBursts(NO_CATCH_SPOT, collect(9, 5), PLAYER).bursts).toEqual(amber);
	});

	it("rings a point-dot catch in a combo in the player's colour, with the amber ring inside", () => {
		const point: GameEvent = { type: "collectPoint", value: 12, step: 2, sameTick: false };
		expect(stepBursts(NO_CATCH_SPOT, point, PLAYER).bursts).toEqual([
			{ kind: "ring", x: 120, y: 340, color: PINK, size: 80 },
			{ kind: "ring", x: 120, y: 340, color: COMBO_AMBER, size: 28 },
		]);
	});

	it("rings a same-tick catch where the catch before it landed, and keeps that spot", () => {
		const first = stepBursts(NO_CATCH_SPOT, collect(1, 1), PLAYER);
		const moved = { ...PLAYER, x: 130, y: 350 };
		const point: GameEvent = { type: "collectPoint", value: 10, step: 1, sameTick: true };
		const second = stepBursts(first.catchSpot, point, moved);
		expect(second.bursts).toEqual([{ kind: "ring", x: 120, y: 340, color: PINK, size: 80 }]);
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
