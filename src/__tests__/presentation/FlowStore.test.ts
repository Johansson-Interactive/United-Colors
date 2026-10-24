import { createGameStore } from "../../application/GameStore";
import type { GamePhase } from "../../domain/types";
import { createFlowStore, type GameControls } from "../../presentation/flow/flowStore";
import type { GameFacts } from "../../presentation/flow/screenFlow";
import { INK_LIFT } from "../../presentation/theme/theme";

const AT = { x: 10, y: 20 };
const PINK = "#E91E63";
const BLUE = "#2196F3";

/** Game controls that do nothing, for a player with tilt */
const IDLE: GameControls = {
	play: () => {},
	pause: () => {},
	resume: () => {},
	startKiosk: () => {},
	haltKiosk: () => {},
	runKiosk: () => {},
	flood: () => {},
	takeLevelPose: () => {},
	facts: () => ({ tiltPresent: true, playerColor: PINK }),
};

/**
 * A game store and a flow store on it, following the game, with game controls that write every
 * call to one list and answer the flow's questions from `answers`, which the test can change
 */
function setup() {
	const game = createGameStore();
	const calls: string[] = [];
	const answers: GameFacts = { tiltPresent: true, playerColor: PINK };
	let cover: (() => void) | null = null;
	const { store: flow, follow } = createFlowStore(game, {
		play: (color) => calls.push(`play ${color}`),
		pause: () => calls.push("pause"),
		resume: () => calls.push("resume"),
		startKiosk: () => calls.push("startKiosk"),
		haltKiosk: () => calls.push("haltKiosk"),
		runKiosk: () => calls.push("runKiosk"),
		flood: (color, at, onCovered) => {
			calls.push(`flood ${color} ${at.x},${at.y}`);
			cover = onCovered;
		},
		takeLevelPose: () => calls.push("takeLevelPose"),
		facts: () => ({ ...answers }),
	});
	const unfollow = follow();
	const publish = (phase: GamePhase) =>
		game.getState().updateFrame({ ...game.getState().frame, phase });
	return {
		flow,
		follow,
		unfollow,
		calls,
		answers,
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
		const { store: flow } = createFlowStore(game, IDLE);
		expect(flow.getState().screen).toEqual({ kind: "pause" });
	});

	it("a finger on the field pauses the game at once and keeps the HUD up, frosting", () => {
		const { flow, calls, publish, screen } = setup();
		publish("RUNNING");
		flow.getState().dispatch({ type: "fieldTouched", landedAt: 0 });
		expect(calls).toEqual(["pause"]);
		publish("PAUSED");
		expect(screen()).toEqual({ kind: "frosting", start: "finger" });
		flow.getState().dispatch({ type: "bloomCovered" });
		expect(screen()).toEqual({ kind: "pause" });
	});

	it("a finger lifted before the frost covers resumes the game, and the HUD is back as it reports play", () => {
		const { flow, calls, publish, screen } = setup();
		publish("RUNNING");
		flow.getState().dispatch({ type: "fieldTouched", landedAt: 0 });
		publish("PAUSED");
		flow.getState().dispatch({ type: "bloomCleared", liftedAt: 0, relanded: false });
		expect(calls).toEqual(["pause", "resume"]);
		publish("RUNNING");
		expect(screen()).toEqual({ kind: "hud" });
	});

	it("the dev pause dot pauses the game at once and blooms into the pause", () => {
		const { flow, calls, publish, screen } = setup();
		publish("RUNNING");
		flow.getState().dispatch({ type: "pausePressed" });
		expect(calls).toEqual(["pause"]);
		publish("PAUSED");
		expect(screen()).toEqual({ kind: "frosting", start: "pauseDot" });
	});

	it("a finger on the pause opens Get ready when there is tilt, asking nothing of the game", () => {
		const { flow, calls, publish, screen } = setup();
		publish("PAUSED");
		flow.getState().dispatch({ type: "fieldTouched", landedAt: 0 });
		expect(screen()).toEqual({ kind: "getReady" });
		expect(calls).toEqual([]);
	});

	it("a finger on the frost resumes at once on a device without tilt", () => {
		const { flow, calls, answers, publish, screen } = setup();
		answers.tiltPresent = false;
		publish("PAUSED");
		flow.getState().dispatch({ type: "fieldTouched", landedAt: 0 });
		expect(calls).toEqual(["resume"]);
		expect(screen()).toEqual({ kind: "pause" });
	});

	it("Get ready's hold takes the level pose and resumes at once", () => {
		const { flow, calls, publish } = setup();
		publish("PAUSED");
		flow.getState().dispatch({ type: "fieldTouched", landedAt: 0 });
		flow.getState().dispatch({ type: "readyHeld" });
		expect(calls).toEqual(["takeLevelPose", "resume"]);
	});

	it("Get ready's cup shutting brings the pause screen back, touching nothing", () => {
		const { flow, calls, publish, screen } = setup();
		publish("PAUSED");
		flow.getState().dispatch({ type: "fieldTouched", landedAt: 0 });
		calls.length = 0;
		flow.getState().dispatch({ type: "readyShut" });
		expect(calls).toEqual([]);
		expect(screen()).toEqual({ kind: "pause" });
	});

	it("the pause's speed button opens the speed view in the player's colour", () => {
		const { flow, answers, publish, screen } = setup();
		answers.playerColor = BLUE;
		publish("PAUSED");
		flow.getState().dispatch({ type: "speedPressed", from: "pause" });
		expect(screen()).toEqual({ kind: "speed", color: BLUE });
	});

	it("retry takes the level pose and floods in the player's colour, playing only once it covers", () => {
		const { flow, calls, answers, publish, covers } = setup();
		answers.playerColor = BLUE;
		publish("GAME_OVER");
		flow.getState().dispatch({ type: "retryPressed", at: AT });
		expect(calls).toEqual(["takeLevelPose", `flood ${BLUE} 10,20`]);
		covers();
		expect(calls).toEqual(["takeLevelPose", `flood ${BLUE} 10,20`, `play ${BLUE}`]);
	});

	it("leaving the game over floods, and starts the kiosk only once the flood covers", () => {
		const { flow, calls, publish, covers } = setup();
		publish("GAME_OVER");
		flow.getState().dispatch({ type: "leavePressed", at: AT });
		expect(calls).toEqual([`flood ${INK_LIFT} 10,20`]);
		covers();
		expect(calls).toEqual([`flood ${INK_LIFT} 10,20`, "startKiosk"]);
	});

	it("the speed view opened from the title halts the kiosk, and backing out runs it again", () => {
		const { flow, calls, screen } = setup();
		flow.getState().dispatch({ type: "speedPressed", from: "menu", color: PINK });
		expect(calls).toEqual(["haltKiosk"]);
		flow.getState().dispatch({ type: "speedBacked" });
		expect(calls).toEqual(["haltKiosk", "runKiosk"]);
		expect(screen()).toEqual({ kind: "title" });
	});

	it("the title's speed button opens in the colour the play dot showed", () => {
		const { flow, screen } = setup();
		flow.getState().dispatch({ type: "speedPressed", from: "menu", color: BLUE });
		expect(screen()).toEqual({ kind: "speed", color: BLUE });
	});

	it("PLAY takes the level pose at the press, floods, and plays only once the flood covers", () => {
		const { flow, calls, covers } = setup();
		flow.getState().dispatch({ type: "startPressed", color: PINK, at: AT });
		expect(calls).toEqual(["takeLevelPose", `flood ${PINK} 10,20`]);
		covers();
		expect(calls).toEqual(["takeLevelPose", `flood ${PINK} 10,20`, `play ${PINK}`]);
	});

	it("the bench's auto-start floods into a run, steered from flat with no level pose taken", () => {
		const { flow, calls, screen, covers } = setup();
		flow.getState().dispatch({ type: "autoStarted", color: BLUE, at: AT });
		expect(screen()).toEqual({ kind: "title" });
		covers();
		expect(calls).toEqual([`flood ${BLUE} 10,20`, `play ${BLUE}`]);
	});

	it("ignores taps while a flood is on its way", () => {
		const { flow, calls, publish, screen } = setup();
		publish("GAME_OVER");
		flow.getState().dispatch({ type: "retryPressed", at: AT });
		flow.getState().dispatch({ type: "leavePressed", at: AT });
		flow.getState().dispatch({ type: "retryPressed", at: AT });
		expect(calls).toEqual(["takeLevelPose", `flood ${PINK} 10,20`]);
		expect(screen()).toEqual({ kind: "gameOver" });
	});

	it("follows the game's phase while a flood is on its way", () => {
		const { flow, publish, screen, covers } = setup();
		publish("GAME_OVER");
		flow.getState().dispatch({ type: "retryPressed", at: AT });
		publish("RUNNING");
		expect(screen()).toEqual({ kind: "hud" });
		covers();
		expect(screen()).toEqual({ kind: "hud" });
	});

	it("the stage's layouts start the kiosk once, across repeated layouts and floods", () => {
		const { flow, calls, covers } = setup();
		flow.getState().dispatch({ type: "stageLaidOut" });
		flow.getState().dispatch({ type: "stageLaidOut" });
		flow.getState().dispatch({ type: "retryPressed", at: AT });
		covers();
		flow.getState().dispatch({ type: "stageLaidOut" });
		expect(calls).toEqual(["startKiosk", "takeLevelPose", `flood ${PINK} 10,20`, `play ${PINK}`]);
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
