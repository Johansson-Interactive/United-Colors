import { createGameStore } from "../../application/GameStore";
import { onGameEvents } from "../../application/gameEvents";
import type { GameEvent, RenderFrame } from "../../domain/types";

const frameWith = (events: GameEvent[], score = 0): RenderFrame => ({
	phase: "RUNNING",
	score,
	dots: [],
	events,
});

describe("onGameEvents", () => {
	it("hands over each event of a new frame once, in order, with the frame", () => {
		const store = createGameStore();
		const seen: Array<[GameEvent, number]> = [];
		onGameEvents(store, (event, frame) => seen.push([event, frame.score]));
		store.getState().updateFrame(frameWith([{ type: "collect", value: 1 }, { type: "spit" }], 1));
		store.getState().updateFrame(frameWith([], 1));
		store.getState().updateFrame(frameWith([{ type: "gameOver" }], 1));
		expect(seen).toEqual([
			[{ type: "collect", value: 1 }, 1],
			[{ type: "spit" }, 1],
			[{ type: "gameOver" }, 1],
		]);
	});

	it("ignores store changes that keep the frame", () => {
		const store = createGameStore();
		const seen: GameEvent[] = [];
		store.getState().updateFrame(frameWith([{ type: "pointSpawn" }]));
		onGameEvents(store, (event) => seen.push(event));
		store.getState().setHighScore(3);
		store.getState().updateSettings({ soundEnabled: false });
		expect(seen).toEqual([]);
	});

	it("stops after unsubscribe", () => {
		const store = createGameStore();
		const seen: GameEvent[] = [];
		onGameEvents(store, (event) => seen.push(event))();
		store.getState().updateFrame(frameWith([{ type: "pointSpawn" }]));
		expect(seen).toEqual([]);
	});
});
