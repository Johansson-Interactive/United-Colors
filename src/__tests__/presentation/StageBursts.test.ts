import type { GameEvent } from "../../domain/types";
import { INITIAL_BURST_MEMORY, stepBursts } from "../../presentation/effects/stageBursts";

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
		const step = stepBursts(INITIAL_BURST_MEMORY, collect(5, 1), PLAYER);
		expect(step.bursts).toEqual([{ kind: "pop", x: 120, y: 340, text: "+5", color: PINK }]);
		expect(step.shake).toBe(false);
	});

	it("pops in combo amber from the second catch of a combo on", () => {
		const step = stepBursts(INITIAL_BURST_MEMORY, collect(3, 2), PLAYER);
		expect(step.bursts).toEqual([{ kind: "pop", x: 120, y: 340, text: "+3", color: AMBER }]);
	});

	it("pops a point-dot catch and rings it in the player's colour at the same spot", () => {
		const point: GameEvent = { type: "collectPoint", value: 10, step: 1, sameTick: false };
		expect(stepBursts(INITIAL_BURST_MEMORY, point, PLAYER).bursts).toEqual([
			{ kind: "pop", x: 120, y: 340, text: "+10", color: PINK },
			{ kind: "ring", x: 120, y: 340, color: PINK, size: 80 },
		]);
	});

	it("pops a same-tick catch where the catch before it did, and keeps that spot", () => {
		const first = stepBursts(INITIAL_BURST_MEMORY, collect(1, 1), PLAYER);
		const moved = { ...PLAYER, x: 130, y: 350 };
		const second = stepBursts(first.memory, collect(3, 2, true), moved);
		expect(second.bursts).toEqual([{ kind: "pop", x: 120, y: 340, text: "+3", color: AMBER }]);
		expect(second.memory).toEqual(first.memory);
	});

	it("pops a combo's bare total, larger and in amber, where its last catch landed", () => {
		const last = stepBursts(INITIAL_BURST_MEMORY, collect(5, 3), PLAYER);
		const moved = { ...PLAYER, x: 200, y: 90 };
		const end: GameEvent = { type: "comboEnd", total: 16, catches: 4 };
		const step = stepBursts(last.memory, end, moved);
		expect(step.bursts).toEqual([{ kind: "comboTotal", x: 120, y: 340, text: "16", color: AMBER }]);
		expect(step.shake).toBe(false);
	});

	it("rings the game over in white at the player and shakes the stage", () => {
		const last = stepBursts(INITIAL_BURST_MEMORY, collect(1, 1), PLAYER);
		const moved = { ...PLAYER, x: 60, y: 70 };
		const step = stepBursts(last.memory, { type: "gameOver" }, moved);
		expect(step.bursts).toEqual([{ kind: "ring", x: 60, y: 70, color: "#F4F6FB", size: 90 }]);
		expect(step.shake).toBe(true);
	});

	it("shows nothing for a point-dot spawn or the spit", () => {
		for (const event of [{ type: "pointSpawn" }, { type: "spit" }] as const) {
			expect(stepBursts(INITIAL_BURST_MEMORY, event, PLAYER)).toEqual({
				memory: INITIAL_BURST_MEMORY,
				bursts: [],
				shake: false,
				catchCue: null,
			});
		}
	});

	it("has a catch's bursts wait for the catch stagger, and everything else show at once", () => {
		const cue = (event: GameEvent) => stepBursts(INITIAL_BURST_MEMORY, event, PLAYER).catchCue;
		expect(cue(collect(1, 1))).toEqual({ sameTick: false });
		expect(cue({ type: "collectPoint", value: 10, step: 2, sameTick: true })).toEqual({
			sameTick: true,
		});
		expect(cue({ type: "comboEnd", total: 4, catches: 2 })).toBeNull();
		expect(cue({ type: "gameOver" })).toBeNull();
	});
});
