import type { GamePhase } from "../../domain/types";
import {
	type FlowState,
	type GameFacts,
	INITIAL_FLOW,
	type Screen,
	screenOf,
	stepFlow,
} from "../../presentation/flow/screenFlow";
import { INK_LIFT } from "../../presentation/theme/theme";

const AT = { x: 10, y: 20 };
const ZERO = { x: 0.3, y: -0.1 };
const PINK = "#E91E63";
const BLUE = "#2196F3";

/** What the game answers unless a test says otherwise: a level pose set, tilt, a pink player */
const GAME: GameFacts = { levelPoseSet: true, tiltPresent: true, playerColor: PINK };

const open = (from: "start" | "pause" | "menu", color = PINK): FlowState => ({
	...INITIAL_FLOW,
	settle: { from, color },
});

const RUNNING: FlowState = { ...INITIAL_FLOW, phase: "RUNNING" };
const PAUSED: FlowState = { ...INITIAL_FLOW, phase: "PAUSED" };
/** A finger on the field has frozen the run and is frosting it from AT */
const FROSTING: FlowState = { ...PAUSED, bloom: AT };
const GET_READY: FlowState = { ...PAUSED, over: { kind: "getReady" } };

/** A step that only leaves the flow in `state`, showing its screen */
const rests = (state: FlowState) => ({ state, screen: screenOf(state) });

describe("screen flow", () => {
	it("a first PLAY opens the settle bowl in the play dot's colour instead of playing", () => {
		const step = stepFlow(
			INITIAL_FLOW,
			{ type: "startPressed", color: BLUE, at: AT },
			{ ...GAME, levelPoseSet: false },
		);
		expect(step.state).toEqual(open("start", BLUE));
		expect(step.flood).toBeUndefined();
		expect(step.calibrate).toBeUndefined();
	});

	it("with a level pose set, PLAY floods straight into a game in that colour", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "startPressed", color: BLUE, at: AT }, GAME);
		expect(step.state).toEqual({ ...INITIAL_FLOW, flooding: true });
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "play", color: BLUE } });
	});

	it("the bench's auto-start floods into a game in that colour, with no level pose asked for", () => {
		const step = stepFlow(
			INITIAL_FLOW,
			{ type: "autoStarted", color: BLUE, at: AT },
			{ ...GAME, levelPoseSet: false },
		);
		expect(step.state).toEqual({ ...INITIAL_FLOW, flooding: true });
		expect(step.act).toBeUndefined();
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "play", color: BLUE } });
	});

	it("the bench's auto-start also floods straight into a game with a level pose set", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "autoStarted", color: BLUE, at: AT }, GAME);
		expect(step.state).toEqual({ ...INITIAL_FLOW, flooding: true });
		expect(step.act).toBeUndefined();
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "play", color: BLUE } });
	});

	it("the level button opens the bowl from the title in the play dot's colour, from the pause in the player's", () => {
		expect(
			stepFlow(INITIAL_FLOW, { type: "levelPressed", from: "menu", color: BLUE }, GAME).state,
		).toEqual(open("menu", BLUE));
		expect(
			stepFlow(
				INITIAL_FLOW,
				{ type: "levelPressed", from: "pause" },
				{ ...GAME, playerColor: BLUE },
			).state,
		).toEqual(open("pause", BLUE));
	});

	it("settling for a first game saves the pose and floods from the bowl into play", () => {
		const step = stepFlow(
			open("start"),
			{
				type: "settled",
				zero: ZERO,
				facingDown: false,
				at: AT,
			},
			GAME,
		);
		expect(step.calibrate).toEqual({ zero: ZERO, facingDown: false });
		expect(step.flood).toEqual({ color: PINK, at: AT, action: { kind: "play", color: PINK } });
		// The bowl stays under the flood until it has covered the screen
		expect(step.state.settle).toEqual({ from: "start", color: PINK });
		expect(step.state.flooding).toBe(true);
		expect(stepFlow(step.state, { type: "covered" }, GAME).state).toEqual(INITIAL_FLOW);
	});

	it("settling from the pause saves the pose for the side faced and returns to the pause screen", () => {
		const step = stepFlow(
			{ ...open("pause", BLUE), phase: "PAUSED" },
			{ type: "settled", zero: ZERO, facingDown: true, at: AT },
			GAME,
		);
		expect(step.calibrate).toEqual({ zero: ZERO, facingDown: true });
		expect(step.flood).toBeUndefined();
		expect(step.act).toBeUndefined();
		expect(step.state).toEqual(PAUSED);
		expect(step.screen).toEqual({ kind: "pause" });
	});

	it("settling from the title only saves the pose; the title comes straight back", () => {
		const step = stepFlow(
			open("menu"),
			{ type: "settled", zero: ZERO, facingDown: false, at: AT },
			GAME,
		);
		expect(step.calibrate).toEqual({ zero: ZERO, facingDown: false });
		expect(step.flood).toBeUndefined();
		expect(step.state).toEqual(INITIAL_FLOW);
	});

	it("a settle with no bowl open does nothing", () => {
		const step = stepFlow(
			INITIAL_FLOW,
			{ type: "settled", zero: ZERO, facingDown: false, at: AT },
			GAME,
		);
		expect(step).toEqual(rests(INITIAL_FLOW));
	});

	it("backing out of the bowl closes it without saving", () => {
		const step = stepFlow(open("start"), { type: "settleBacked" }, GAME);
		expect(step.state).toEqual(INITIAL_FLOW);
		expect(step.calibrate).toBeUndefined();
		expect(step.flood).toBeUndefined();
	});

	it("RETRY floods into a new game in the player's colour", () => {
		const step = stepFlow(
			INITIAL_FLOW,
			{ type: "retryPressed", at: AT },
			{ ...GAME, playerColor: BLUE },
		);
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "play", color: BLUE } });
	});

	it("QUIT and BACK flood in ink to the title", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "leavePressed", at: AT }, GAME);
		expect(step.flood).toEqual({ color: INK_LIFT, at: AT, action: { kind: "startKiosk" } });
	});

	it("levelling from the title halts the kiosk, and settling brings it back", () => {
		const opened = stepFlow(
			INITIAL_FLOW,
			{ type: "levelPressed", from: "menu", color: BLUE },
			GAME,
		);
		expect(opened.act).toEqual({ kind: "haltKiosk" });
		const settled = stepFlow(
			opened.state,
			{
				type: "settled",
				zero: ZERO,
				facingDown: false,
				at: AT,
			},
			GAME,
		);
		expect(settled.act).toEqual({ kind: "runKiosk" });
	});

	it("backing out of the bowl over the title brings the kiosk back", () => {
		expect(stepFlow(open("menu"), { type: "settleBacked" }, GAME).act).toEqual({
			kind: "runKiosk",
		});
		expect(stepFlow(open("start"), { type: "settleBacked" }, GAME).act).toEqual({
			kind: "runKiosk",
		});
	});

	it("a first PLAY halts the kiosk while the bowl is open", () => {
		const step = stepFlow(
			INITIAL_FLOW,
			{ type: "startPressed", color: PINK, at: AT },
			{ ...GAME, levelPoseSet: false },
		);
		expect(step.act).toEqual({ kind: "haltKiosk" });
	});

	it("starting a game from the bowl does not restart the kiosk", () => {
		const settled = stepFlow(
			open("start"),
			{
				type: "settled",
				zero: ZERO,
				facingDown: false,
				at: AT,
			},
			GAME,
		);
		expect(settled.act).toBeUndefined();
		expect(settled.flood?.action).toEqual({ kind: "play", color: PINK });
		expect(stepFlow(settled.state, { type: "covered" }, GAME).act).toBeUndefined();
	});

	it("PLAY with a level pose set leaves the kiosk to the game it floods into", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "startPressed", color: BLUE, at: AT }, GAME);
		expect(step.act).toBeUndefined();
	});

	it("the bowl over the pause leaves the frozen game alone", () => {
		const opened = stepFlow(PAUSED, { type: "levelPressed", from: "pause" }, GAME);
		expect(opened.act).toBeUndefined();
		expect(stepFlow(opened.state, { type: "settleBacked" }, GAME).act).toBeUndefined();
		const settled = stepFlow(
			opened.state,
			{
				type: "settled",
				zero: ZERO,
				facingDown: false,
				at: AT,
			},
			GAME,
		);
		expect(settled.act).toBeUndefined();
	});

	it("the speed button opens the speed view in the player's colour, and BACK closes it", () => {
		const opened = stepFlow(
			PAUSED,
			{ type: "speedPressed", from: "pause" },
			{ ...GAME, playerColor: BLUE },
		);
		expect(opened).toEqual({
			state: { ...PAUSED, over: { kind: "speed", from: "pause", color: BLUE } },
			screen: { kind: "speed", color: BLUE },
		});
		expect(stepFlow(opened.state, { type: "speedBacked" }, GAME)).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it("the speed view over the pause saves nothing and starts no flood, and leaves the kiosk alone", () => {
		const opened = stepFlow(PAUSED, { type: "speedPressed", from: "pause" }, GAME);
		expect(opened.calibrate).toBeUndefined();
		expect(opened.flood).toBeUndefined();
		expect(opened.act).toBeUndefined();
		expect(stepFlow(opened.state, { type: "speedBacked" }, GAME).act).toBeUndefined();
	});

	it("the speed button on the title opens the speed view in the play dot's colour, halting the kiosk", () => {
		const opened = stepFlow(
			INITIAL_FLOW,
			{ type: "speedPressed", from: "menu", color: BLUE },
			GAME,
		);
		expect(opened).toEqual({
			state: { ...INITIAL_FLOW, over: { kind: "speed", from: "menu", color: BLUE } },
			screen: { kind: "speed", color: BLUE },
			act: { kind: "haltKiosk" },
		});
		expect(stepFlow(opened.state, { type: "speedBacked" }, GAME)).toEqual({
			state: INITIAL_FLOW,
			screen: { kind: "title" },
			act: { kind: "runKiosk" },
		});
	});

	it("a flood covering the screen closes the speed view too", () => {
		const opened = stepFlow(PAUSED, { type: "speedPressed", from: "pause" }, GAME).state;
		expect(stepFlow(opened, { type: "covered" }, GAME).state).toEqual(PAUSED);
	});

	it("a finger on the field in play freezes the run at once and blooms the frost from under it", () => {
		expect(stepFlow(RUNNING, { type: "fieldTouched", at: AT }, GAME)).toEqual({
			state: { ...RUNNING, bloom: AT },
			screen: { kind: "frosting", at: AT },
			act: { kind: "pause" },
		});
	});

	it("the bloom keeps the HUD up while the game reports the pause it asked for", () => {
		const frosting = stepFlow(RUNNING, { type: "fieldTouched", at: AT }, GAME).state;
		const paused = stepFlow(frosting, { type: "phaseChanged", phase: "PAUSED" }, GAME);
		expect(paused.state).toEqual(FROSTING);
		expect(paused.screen).toEqual({ kind: "frosting", at: AT });
	});

	it("the frost covering the field opens the pause screen, with nothing more to do to the game", () => {
		expect(stepFlow(FROSTING, { type: "bloomCovered" }, GAME)).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it("a finger lifted before the frost covers the field lets play go on from the frozen frame", () => {
		expect(stepFlow(FROSTING, { type: "bloomCleared" }, GAME)).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
			act: { kind: "resume" },
		});
	});

	it("under the bloom there are no buttons to press, and a second finger starts nothing", () => {
		for (const event of [
			{ type: "fieldTouched", at: AT },
			{ type: "leavePressed", at: AT },
			{ type: "levelPressed", from: "pause" },
			{ type: "speedPressed", from: "pause" },
			{ type: "pausePressed" },
			{ type: "readyHeld" },
			{ type: "readyShut" },
		] as const) {
			expect(stepFlow(FROSTING, event, GAME)).toEqual(rests(FROSTING));
		}
	});

	it("a run that ends under the bloom takes the bloom with it", () => {
		const frosting = stepFlow(RUNNING, { type: "fieldTouched", at: AT }, GAME).state;
		const over = stepFlow(frosting, { type: "phaseChanged", phase: "GAME_OVER" }, GAME);
		expect(over.state).toEqual({ ...INITIAL_FLOW, phase: "GAME_OVER" });
		expect(over.screen).toEqual({ kind: "gameOver" });
	});

	it("a finger on the frost of the pause screen opens Get ready, held", () => {
		expect(stepFlow(PAUSED, { type: "fieldTouched", at: AT }, GAME)).toEqual({
			state: GET_READY,
			screen: { kind: "getReady" },
		});
	});

	it("with no tilt to hold level with, a finger on the frost resumes the game straight away", () => {
		expect(
			stepFlow(PAUSED, { type: "fieldTouched", at: AT }, { ...GAME, tiltPresent: false }),
		).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
			act: { kind: "resume" },
		});
	});

	it("the window shutting after the finger lifts closes Get ready back to the pause screen", () => {
		expect(stepFlow(GET_READY, { type: "readyShut" }, GAME)).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it("a finger on the field does nothing where there is no run to freeze and no frost to open", () => {
		const elsewhere: FlowState[] = [
			INITIAL_FLOW,
			{ ...INITIAL_FLOW, phase: "REJECTING" },
			{ ...INITIAL_FLOW, phase: "GAME_OVER" },
			{ ...open("pause"), phase: "PAUSED" },
			{ ...PAUSED, over: { kind: "speed", from: "pause", color: PINK } },
		];
		for (const state of elsewhere) {
			expect(stepFlow(state, { type: "fieldTouched", at: AT }, GAME)).toEqual(rests(state));
		}
	});

	it("the dev pause dot pauses a run in play, and does nothing anywhere else", () => {
		expect(stepFlow(RUNNING, { type: "pausePressed" }, GAME)).toEqual({
			state: RUNNING,
			screen: { kind: "hud" },
			act: { kind: "pause" },
		});
		for (const state of [
			INITIAL_FLOW,
			PAUSED,
			GET_READY,
			{ ...INITIAL_FLOW, phase: "GAME_OVER" },
		] as const) {
			expect(stepFlow(state, { type: "pausePressed" }, GAME)).toEqual(rests(state));
		}
	});

	it("leaving the app mid-run pauses the game, opening no screen", () => {
		const running: FlowState = { ...INITIAL_FLOW, phase: "RUNNING" };
		expect(stepFlow(running, { type: "appLeft" }, GAME)).toEqual({
			state: running,
			screen: { kind: "hud" },
			act: { kind: "pause" },
		});
	});

	it("leaving the app in Get ready closes it, so the player comes back to the pause screen", () => {
		expect(stepFlow(GET_READY, { type: "appLeft" }, GAME)).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it("leaving the app under the bloom keeps the pause the run already has, and lands on its screen", () => {
		expect(stepFlow(FROSTING, { type: "appLeft" }, GAME)).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it.each<GamePhase>(["KIOSK", "PAUSED", "GAME_OVER"])(
		"leaving the app leaves %s as it is",
		(phase) => {
			const state: FlowState = { ...INITIAL_FLOW, phase };
			expect(stepFlow(state, { type: "appLeft" }, GAME)).toEqual(rests(state));
		},
	);

	it("the ready hold completing closes Get ready and resumes the game, with no flood", () => {
		expect(stepFlow(GET_READY, { type: "readyHeld" }, GAME)).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
			act: { kind: "resume" },
		});
	});

	it("the speed view and the level pose open only from the pause screen, not from Get ready", () => {
		for (const event of [
			{ type: "speedPressed", from: "pause" },
			{ type: "levelPressed", from: "pause" },
		] as const) {
			expect(stepFlow(PAUSED, event, GAME).screen.kind).not.toBe("pause");
			expect(stepFlow(GET_READY, event, GAME)).toEqual(rests(GET_READY));
		}
	});

	it("a hold's word landing after Get ready or the bloom has closed is too late to count", () => {
		for (const event of [
			{ type: "readyHeld" },
			{ type: "readyShut" },
			{ type: "bloomCovered" },
			{ type: "bloomCleared" },
		] as const) {
			expect(stepFlow(PAUSED, event, GAME)).toEqual(rests(PAUSED));
			expect(stepFlow(RUNNING, event, GAME)).toEqual(rests(RUNNING));
		}
	});

	it("after QUIT starts the flood, a finger on the frost does nothing; the flood still lands on the title", () => {
		const quit = stepFlow(PAUSED, { type: "leavePressed", at: AT }, GAME);
		expect(quit.state.flooding).toBe(true);
		const resume = stepFlow(
			quit.state,
			{ type: "fieldTouched", at: AT },
			{ ...GAME, tiltPresent: false },
		);
		expect(resume).toEqual(rests(quit.state));
		const covered = stepFlow(resume.state, { type: "covered" }, GAME);
		expect(covered.state).toEqual(PAUSED);
		expect(quit.flood?.action).toEqual({ kind: "startKiosk" });
	});

	it("a second tap on RETRY while its flood runs starts no second flood", () => {
		const first = stepFlow(INITIAL_FLOW, { type: "retryPressed", at: AT }, GAME);
		expect(first.flood).toBeDefined();
		expect(stepFlow(first.state, { type: "retryPressed", at: AT }, GAME)).toEqual(
			rests(first.state),
		);
		expect(stepFlow(first.state, { type: "leavePressed", at: AT }, GAME)).toEqual(
			rests(first.state),
		);
	});

	it("screen-changing taps are ignored while a flood runs, until it covers the screen", () => {
		const flooding = stepFlow(INITIAL_FLOW, { type: "leavePressed", at: AT }, GAME).state;
		for (const event of [
			{ type: "fieldTouched", at: AT },
			{ type: "appLeft" },
			{ type: "speedPressed", from: "menu", color: PINK },
			{ type: "levelPressed", from: "pause" },
			{ type: "startPressed", color: PINK, at: AT },
			{ type: "settleBacked" },
		] as const) {
			expect(stepFlow(flooding, event, GAME)).toEqual(rests(flooding));
		}
		const after = stepFlow(flooding, { type: "covered" }, GAME).state;
		expect(stepFlow(after, { type: "retryPressed", at: AT }, GAME).flood).toBeDefined();
	});

	it("a phase change is recorded and answers with that phase's screen", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "phaseChanged", phase: "RUNNING" }, GAME);
		expect(step).toEqual({ state: { ...INITIAL_FLOW, phase: "RUNNING" }, screen: { kind: "hud" } });
	});

	it("a phase change still lands while a flood runs, and the flood covering keeps it", () => {
		const flooding = stepFlow(INITIAL_FLOW, { type: "retryPressed", at: AT }, GAME).state;
		const paused = stepFlow(flooding, { type: "phaseChanged", phase: "PAUSED" }, GAME).state;
		expect(paused).toEqual({ ...flooding, phase: "PAUSED" });
		expect(stepFlow(paused, { type: "covered" }, GAME).state).toEqual({
			...INITIAL_FLOW,
			phase: "PAUSED",
		});
	});

	it("every step answers with the screen of the state it leaves", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "levelPressed", from: "menu", color: BLUE }, GAME);
		expect(step.screen).toEqual({ kind: "settle", color: BLUE });
		expect(stepFlow(step.state, { type: "settleBacked" }, GAME).screen).toEqual({ kind: "title" });
	});

	it("the stage's first layout starts the kiosk, and later layouts do nothing", () => {
		const first = stepFlow(INITIAL_FLOW, { type: "stageLaidOut" }, GAME);
		expect(first.act).toEqual({ kind: "startKiosk" });
		expect(first.state).toEqual({ ...INITIAL_FLOW, kioskStarted: true });
		expect(stepFlow(first.state, { type: "stageLaidOut" }, GAME)).toEqual(rests(first.state));
	});

	it("the first layout still starts the kiosk while a flood runs", () => {
		const flooding = stepFlow(INITIAL_FLOW, { type: "retryPressed", at: AT }, GAME).state;
		expect(stepFlow(flooding, { type: "stageLaidOut" }, GAME).act).toEqual({ kind: "startKiosk" });
	});

	it("covering a flood keeps the kiosk marked as started", () => {
		const started = stepFlow(INITIAL_FLOW, { type: "stageLaidOut" }, GAME).state;
		const covered = stepFlow(started, { type: "covered" }, GAME).state;
		expect(covered.kioskStarted).toBe(true);
		expect(stepFlow(covered, { type: "stageLaidOut" }, GAME).act).toBeUndefined();
	});
});

describe("which screen shows", () => {
	const PHASES: readonly GamePhase[] = ["KIOSK", "RUNNING", "REJECTING", "PAUSED", "GAME_OVER"];
	const SETTLES = [null, "start", "menu", "pause"] as const;
	const OVERS = [
		null,
		{ kind: "speed", from: "menu", color: BLUE },
		{ kind: "speed", from: "pause", color: BLUE },
		{ kind: "getReady" },
	] as const satisfies readonly FlowState["over"][];
	const FLOODS = [false, true] as const;

	const title: Screen = { kind: "title" };
	const hud: Screen = { kind: "hud" };
	const pause: Screen = { kind: "pause" };
	const gameOver: Screen = { kind: "gameOver" };
	const bowl: Screen = { kind: "settle", color: PINK };
	const speed: Screen = { kind: "speed", color: BLUE };
	const getReady: Screen = { kind: "getReady" };

	/**
	 * The expected screen for each phase and flow, written out by hand. The flood never decides
	 * the screen: the one under it stays until it covers. Combinations no tap sequence reaches
	 * (marked "impossible") resolve to the phase's own screen.
	 */
	const EXPECTED: Record<
		GamePhase,
		Record<NonNullable<(typeof SETTLES)[number]> | "none", [Screen, Screen, Screen, Screen]>
	> = {
		// [nothing over the screen, speed view from the title, speed view from the pause, Get
		// ready]; the bowl and the speed view are never open together, and Get ready only opens
		// over the pause
		KIOSK: {
			none: [title, speed, title, title], // the speed button on the title; the pause's, Get ready: impossible
			start: [bowl, bowl, bowl, bowl], // a first PLAY; speed, Get ready: impossible
			menu: [bowl, bowl, bowl, bowl], // the level button on the title; speed, Get ready: impossible
			pause: [title, speed, title, title], // impossible: the pause's bowl over the title
		},
		RUNNING: {
			none: [hud, hud, hud, hud], // speed, Get ready: impossible
			start: [hud, hud, hud, hud], // impossible: a bowl over a running game
			menu: [hud, hud, hud, hud], // impossible
			pause: [hud, hud, hud, hud], // impossible
		},
		REJECTING: {
			none: [hud, hud, hud, hud], // speed, Get ready: impossible
			start: [hud, hud, hud, hud], // impossible
			menu: [hud, hud, hud, hud], // impossible
			pause: [hud, hud, hud, hud], // impossible
		},
		PAUSED: {
			none: [pause, pause, speed, getReady], // the title's speed view: impossible
			start: [pause, pause, speed, getReady], // impossible: the title's bowl over the pause
			menu: [pause, pause, speed, getReady], // impossible
			// the level button on the pause; with speed or Get ready: impossible
			pause: [bowl, bowl, bowl, bowl],
		},
		GAME_OVER: {
			none: [gameOver, gameOver, gameOver, gameOver], // speed, Get ready: impossible
			start: [gameOver, gameOver, gameOver, gameOver], // impossible
			menu: [gameOver, gameOver, gameOver, gameOver], // impossible
			pause: [gameOver, gameOver, gameOver, gameOver], // impossible
		},
	};

	for (const phase of PHASES) {
		for (const from of SETTLES) {
			OVERS.forEach((over, i) => {
				for (const flooding of FLOODS) {
					const state: FlowState = {
						phase,
						settle: from ? { from, color: PINK } : null,
						over,
						flooding,
						bloom: null,
						kioskStarted: false,
					};
					const expected = EXPECTED[phase][from ?? "none"][i];
					const overName = over
						? over.kind === "speed"
							? `speed from ${over.from}`
							: over.kind
						: "nothing";
					it(`${phase}, bowl ${from ?? "closed"}, over it ${overName}${flooding ? ", flooding" : ""}: ${expected.kind}`, () => {
						expect(screenOf(state)).toEqual(expected);
					});
				}
			});
		}
	}
});

describe("the bloom's screen", () => {
	it("keeps the HUD up, frosting, over a run in play or frozen by it", () => {
		for (const phase of ["RUNNING", "PAUSED"] as const) {
			expect(screenOf({ ...INITIAL_FLOW, phase, bloom: AT })).toEqual({ kind: "frosting", at: AT });
		}
	});

	it("gives way to the phase's own screen anywhere else", () => {
		expect(screenOf({ ...INITIAL_FLOW, bloom: AT })).toEqual({ kind: "title" });
		expect(screenOf({ ...INITIAL_FLOW, phase: "REJECTING", bloom: AT })).toEqual({ kind: "hud" });
		expect(screenOf({ ...INITIAL_FLOW, phase: "GAME_OVER", bloom: AT })).toEqual({
			kind: "gameOver",
		});
	});
});
