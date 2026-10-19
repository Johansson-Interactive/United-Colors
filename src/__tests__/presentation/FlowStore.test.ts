import { createGameStore } from "../../application/GameStore";
import type { GamePhase } from "../../domain/types";
import { createFlowStore } from "../../presentation/flow/flowStore";

const AT = { x: 10, y: 20 };
const ZERO = { x: 0.3, y: -0.1 };
const PINK = "#E91E63";

/**
 * A game store and a flow store on it, following the game, with sinks that write every call to
 * one list
 */
function setup() {
	const game = createGameStore();
	const calls: string[] = [];
	let cover: (() => void) | null = null;
	const { store: flow, follow } = createFlowStore(game, {
		perform: (action) => calls.push(`act ${action.kind}`),
		flood: (color, at, onCovered) => {
			calls.push(`flood ${color} ${at.x},${at.y}`);
			cover = onCovered;
		},
		calibrate: (zero, facingDown) =>
			calls.push(`calibrate ${zero.x},${zero.y}${facingDown ? " down" : ""}`),
	});
	const unfollow = follow();
	const publish = (phase: GamePhase) =>
		game.getState().updateFrame({ ...game.getState().frame, phase });
	return {
		flow,
		follow,
		unfollow,
		calls,
		publish,
		screen: () => flow.getState().screen,
		/** The flood in flight reports that it covers the screen */
		covers: () => cover?.(),
	};
}

describe("flow store", () => {
	it("shows the game over the moment the game publishes it", () => {
		const { publish, screen } = setup();
		publish("RUNNING");
		publish("GAME_OVER");
		expect(screen()).toEqual({ kind: "gameOver" });
	});

	it("starts on the screen of the game's phase", () => {
		const game = createGameStore();
		game.getState().updateFrame({ ...game.getState().frame, phase: "PAUSED" });
		const { store: flow } = createFlowStore(game, {
			perform: () => {},
			flood: () => {},
			calibrate: () => {},
		});
		expect(flow.getState().screen).toEqual({ kind: "pause" });
	});

	it("a pause tap pauses the game at once", () => {
		const { flow, calls, publish } = setup();
		publish("RUNNING");
		flow.getState().dispatch({ type: "pausePressed" });
		expect(calls).toEqual(["act pause"]);
	});

	it("PLAY with a level pose set floods, and plays only once the flood covers", () => {
		const { flow, calls, covers } = setup();
		flow.getState().dispatch({ type: "startPressed", color: PINK, hasZero: true, at: AT });
		expect(calls).toEqual([`flood ${PINK} 10,20`]);
		covers();
		expect(calls).toEqual([`flood ${PINK} 10,20`, "act play"]);
	});

	it("a settled bowl adopts the pose, then floods into play", () => {
		const { flow, calls, screen, covers } = setup();
		flow.getState().dispatch({ type: "startPressed", color: PINK, hasZero: false, at: AT });
		expect(screen()).toEqual({ kind: "settle", color: PINK });
		flow.getState().dispatch({ type: "settled", zero: ZERO, facingDown: true, at: AT });
		covers();
		expect(calls).toEqual([
			"act haltKiosk",
			"calibrate 0.3,-0.1 down",
			`flood ${PINK} 10,20`,
			"act play",
		]);
	});

	it("a bowl settled from the title adopts the pose, then runs the kiosk again", () => {
		const { flow, calls, screen } = setup();
		flow.getState().dispatch({ type: "levelPressed", from: "menu", color: PINK });
		flow.getState().dispatch({ type: "settled", zero: ZERO, facingDown: false, at: AT });
		expect(calls).toEqual(["act haltKiosk", "calibrate 0.3,-0.1", "act runKiosk"]);
		expect(screen()).toEqual({ kind: "title" });
	});

	it("ignores taps while a flood is on its way", () => {
		const { flow, calls, publish, screen } = setup();
		publish("GAME_OVER");
		flow.getState().dispatch({ type: "retryPressed", color: PINK, at: AT });
		flow.getState().dispatch({ type: "leavePressed", at: AT });
		flow.getState().dispatch({ type: "retryPressed", color: PINK, at: AT });
		expect(calls).toEqual([`flood ${PINK} 10,20`]);
		expect(screen()).toEqual({ kind: "gameOver" });
	});

	it("follows the game's phase while a flood is on its way", () => {
		const { flow, publish, screen, covers } = setup();
		publish("GAME_OVER");
		flow.getState().dispatch({ type: "retryPressed", color: PINK, at: AT });
		publish("RUNNING");
		expect(screen()).toEqual({ kind: "hud" });
		covers();
		expect(screen()).toEqual({ kind: "hud" });
	});

	it("stops following the game once unfollowed, and catches up when it follows again", () => {
		const { follow, unfollow, publish, screen } = setup();
		unfollow();
		publish("GAME_OVER");
		expect(screen()).toEqual({ kind: "title" });
		follow();
		expect(screen()).toEqual({ kind: "gameOver" });
		publish("RUNNING");
		expect(screen()).toEqual({ kind: "hud" });
	});
});
