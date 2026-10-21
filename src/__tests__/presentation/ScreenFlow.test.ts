import type { GamePhase } from "../../domain/types";
import {
	cornerDot,
	type FlowState,
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

const open = (from: "start" | "pause" | "menu", color = PINK): FlowState => ({
	...INITIAL_FLOW,
	settle: { from, color },
});

const PAUSED: FlowState = { ...INITIAL_FLOW, phase: "PAUSED" };
const GET_READY: FlowState = { ...PAUSED, overPause: { kind: "getReady" } };

/** A step that only leaves the flow in `state`, showing its screen */
const rests = (state: FlowState) => ({ state, screen: screenOf(state) });

describe("screen flow", () => {
	it("a first PLAY opens the settle bowl in the play dot's colour instead of playing", () => {
		const step = stepFlow(INITIAL_FLOW, {
			type: "startPressed",
			color: PINK,
			hasZero: false,
			at: AT,
		});
		expect(step.state).toEqual(open("start"));
		expect(step.flood).toBeUndefined();
		expect(step.calibrate).toBeUndefined();
	});

	it("with a level pose set, PLAY floods straight into a game in that colour", () => {
		const step = stepFlow(INITIAL_FLOW, {
			type: "startPressed",
			color: BLUE,
			hasZero: true,
			at: AT,
		});
		expect(step.state).toEqual({ ...INITIAL_FLOW, flooding: true });
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "play", color: BLUE } });
	});

	it("the level button opens the bowl from the title or the pause", () => {
		expect(
			stepFlow(INITIAL_FLOW, { type: "levelPressed", from: "menu", color: BLUE }).state,
		).toEqual(open("menu", BLUE));
		expect(
			stepFlow(INITIAL_FLOW, { type: "levelPressed", from: "pause", color: PINK }).state,
		).toEqual(open("pause"));
	});

	it("settling for a first game saves the pose and floods from the bowl into play", () => {
		const step = stepFlow(open("start"), {
			type: "settled",
			zero: ZERO,
			facingDown: false,
			at: AT,
		});
		expect(step.calibrate).toEqual({ zero: ZERO, facingDown: false });
		expect(step.flood).toEqual({ color: PINK, at: AT, action: { kind: "play", color: PINK } });
		// The bowl stays under the flood until it has covered the screen
		expect(step.state.settle).toEqual({ from: "start", color: PINK });
		expect(step.state.flooding).toBe(true);
		expect(stepFlow(step.state, { type: "covered" }).state).toEqual(INITIAL_FLOW);
	});

	it("settling from the pause saves the pose for the side faced and floods into the resume", () => {
		const step = stepFlow(open("pause", BLUE), {
			type: "settled",
			zero: ZERO,
			facingDown: true,
			at: AT,
		});
		expect(step.calibrate).toEqual({ zero: ZERO, facingDown: true });
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "resume" } });
		expect(step.state.settle).not.toBeNull();
	});

	it("settling from the title only saves the pose; the title comes straight back", () => {
		const step = stepFlow(open("menu"), { type: "settled", zero: ZERO, facingDown: false, at: AT });
		expect(step.calibrate).toEqual({ zero: ZERO, facingDown: false });
		expect(step.flood).toBeUndefined();
		expect(step.state).toEqual(INITIAL_FLOW);
	});

	it("a settle with no bowl open does nothing", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "settled", zero: ZERO, facingDown: false, at: AT });
		expect(step).toEqual(rests(INITIAL_FLOW));
	});

	it("backing out of the bowl closes it without saving", () => {
		const step = stepFlow(open("start"), { type: "settleBacked" });
		expect(step.state).toEqual(INITIAL_FLOW);
		expect(step.calibrate).toBeUndefined();
		expect(step.flood).toBeUndefined();
	});

	it("RETRY floods into a new game in the player's colour", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "retryPressed", color: BLUE, at: AT });
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "play", color: BLUE } });
	});

	it("QUIT and BACK flood in ink to the title", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "leavePressed", at: AT });
		expect(step.flood).toEqual({ color: INK_LIFT, at: AT, action: { kind: "kiosk" } });
	});

	it("levelling from the title halts the kiosk, and settling brings it back", () => {
		const opened = stepFlow(INITIAL_FLOW, { type: "levelPressed", from: "menu", color: BLUE });
		expect(opened.act).toEqual({ kind: "haltKiosk" });
		const settled = stepFlow(opened.state, {
			type: "settled",
			zero: ZERO,
			facingDown: false,
			at: AT,
		});
		expect(settled.act).toEqual({ kind: "runKiosk" });
	});

	it("backing out of the bowl over the title brings the kiosk back", () => {
		expect(stepFlow(open("menu"), { type: "settleBacked" }).act).toEqual({ kind: "runKiosk" });
		expect(stepFlow(open("start"), { type: "settleBacked" }).act).toEqual({ kind: "runKiosk" });
	});

	it("a first PLAY halts the kiosk while the bowl is open", () => {
		const step = stepFlow(INITIAL_FLOW, {
			type: "startPressed",
			color: PINK,
			hasZero: false,
			at: AT,
		});
		expect(step.act).toEqual({ kind: "haltKiosk" });
	});

	it("starting a game from the bowl does not restart the kiosk", () => {
		const settled = stepFlow(open("start"), {
			type: "settled",
			zero: ZERO,
			facingDown: false,
			at: AT,
		});
		expect(settled.act).toBeUndefined();
		expect(settled.flood?.action).toEqual({ kind: "play", color: PINK });
		expect(stepFlow(settled.state, { type: "covered" }).act).toBeUndefined();
	});

	it("PLAY with a level pose set leaves the kiosk to the game it floods into", () => {
		const step = stepFlow(INITIAL_FLOW, {
			type: "startPressed",
			color: BLUE,
			hasZero: true,
			at: AT,
		});
		expect(step.act).toBeUndefined();
	});

	it("the bowl over the pause leaves the frozen game alone", () => {
		const opened = stepFlow(PAUSED, { type: "levelPressed", from: "pause", color: PINK });
		expect(opened.act).toBeUndefined();
		expect(stepFlow(opened.state, { type: "settleBacked" }).act).toBeUndefined();
		const settled = stepFlow(opened.state, {
			type: "settled",
			zero: ZERO,
			facingDown: false,
			at: AT,
		});
		expect(settled.act).toBeUndefined();
	});

	it("the speed button opens the speed view in the player's colour, and BACK closes it", () => {
		const opened = stepFlow(PAUSED, { type: "speedPressed", color: BLUE });
		expect(opened).toEqual({
			state: { ...PAUSED, overPause: { kind: "speed", color: BLUE } },
			screen: { kind: "speed", color: BLUE },
		});
		expect(stepFlow(opened.state, { type: "speedBacked" })).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it("the speed view saves nothing and starts no flood, and leaves the kiosk alone", () => {
		const opened = stepFlow(PAUSED, { type: "speedPressed", color: PINK });
		expect(opened.calibrate).toBeUndefined();
		expect(opened.flood).toBeUndefined();
		expect(opened.act).toBeUndefined();
		expect(stepFlow(opened.state, { type: "speedBacked" }).act).toBeUndefined();
	});

	it("a flood covering the screen closes the speed view too", () => {
		const opened = stepFlow(INITIAL_FLOW, { type: "speedPressed", color: PINK }).state;
		expect(stepFlow(opened, { type: "covered" }).state).toEqual(INITIAL_FLOW);
	});

	it("the corner dot in play pauses the game, opening no screen", () => {
		const running: FlowState = { ...INITIAL_FLOW, phase: "RUNNING" };
		expect(stepFlow(running, { type: "cornerPressed", tiltAvailable: true })).toEqual({
			state: running,
			screen: { kind: "hud" },
			act: { kind: "pause" },
		});
	});

	it("the corner dot on the pause opens Get ready over the frozen game", () => {
		expect(stepFlow(PAUSED, { type: "cornerPressed", tiltAvailable: true })).toEqual({
			state: GET_READY,
			screen: { kind: "getReady" },
		});
	});

	it("with no tilt to hold level with, the corner dot on the pause resumes the game straight away", () => {
		expect(stepFlow(PAUSED, { type: "cornerPressed", tiltAvailable: false })).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
			act: { kind: "resume" },
		});
	});

	it("the corner dot in Get ready closes it back to the pause screen", () => {
		expect(stepFlow(GET_READY, { type: "cornerPressed", tiltAvailable: true })).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it("the corner dot does nothing where it is not shown", () => {
		const hidden: FlowState[] = [
			INITIAL_FLOW,
			{ ...INITIAL_FLOW, phase: "GAME_OVER" },
			{ ...open("pause"), phase: "PAUSED" },
			{ ...PAUSED, overPause: { kind: "speed", color: PINK } },
		];
		for (const state of hidden) {
			expect(stepFlow(state, { type: "cornerPressed", tiltAvailable: true })).toEqual(rests(state));
		}
	});

	it("leaving the app mid-run pauses the game, opening no screen", () => {
		const running: FlowState = { ...INITIAL_FLOW, phase: "RUNNING" };
		expect(stepFlow(running, { type: "appLeft" })).toEqual({
			state: running,
			screen: { kind: "hud" },
			act: { kind: "pause" },
		});
	});

	it("leaving the app in Get ready closes it, so the player comes back to the pause screen", () => {
		expect(stepFlow(GET_READY, { type: "appLeft" })).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it.each<GamePhase>(["KIOSK", "PAUSED", "GAME_OVER"])(
		"leaving the app leaves %s as it is",
		(phase) => {
			const state: FlowState = { ...INITIAL_FLOW, phase };
			expect(stepFlow(state, { type: "appLeft" })).toEqual(rests(state));
		},
	);

	it("the ready hold completing closes Get ready and resumes the game, with no flood", () => {
		expect(stepFlow(GET_READY, { type: "readyHeld" })).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
			act: { kind: "resume" },
		});
	});

	it("the speed view and the level pose open only from the pause screen, not from Get ready", () => {
		for (const event of [
			{ type: "speedPressed", color: PINK },
			{ type: "levelPressed", from: "pause", color: PINK },
		] as const) {
			expect(stepFlow(PAUSED, event).screen.kind).not.toBe("pause");
			expect(stepFlow(GET_READY, event)).toEqual(rests(GET_READY));
		}
	});

	it("a ready hold landing after Get ready closed does not resume the game", () => {
		expect(stepFlow(PAUSED, { type: "readyHeld" })).toEqual(rests(PAUSED));
	});

	it("after QUIT starts the flood, the play dot does nothing; the flood still lands on the title", () => {
		const quit = stepFlow(PAUSED, { type: "leavePressed", at: AT });
		expect(quit.state.flooding).toBe(true);
		const resume = stepFlow(quit.state, { type: "cornerPressed", tiltAvailable: false });
		expect(resume).toEqual(rests(quit.state));
		const covered = stepFlow(resume.state, { type: "covered" });
		expect(covered.state).toEqual(PAUSED);
		expect(quit.flood?.action).toEqual({ kind: "kiosk" });
	});

	it("a second tap on RETRY while its flood runs starts no second flood", () => {
		const first = stepFlow(INITIAL_FLOW, { type: "retryPressed", color: BLUE, at: AT });
		expect(first.flood).toBeDefined();
		expect(stepFlow(first.state, { type: "retryPressed", color: BLUE, at: AT })).toEqual(
			rests(first.state),
		);
		expect(stepFlow(first.state, { type: "leavePressed", at: AT })).toEqual(rests(first.state));
	});

	it("screen-changing taps are ignored while a flood runs, until it covers the screen", () => {
		const flooding = stepFlow(INITIAL_FLOW, { type: "leavePressed", at: AT }).state;
		for (const event of [
			{ type: "cornerPressed", tiltAvailable: true },
			{ type: "appLeft" },
			{ type: "speedPressed", color: PINK },
			{ type: "levelPressed", from: "pause", color: PINK },
			{ type: "startPressed", color: PINK, hasZero: true, at: AT },
			{ type: "settleBacked" },
		] as const) {
			expect(stepFlow(flooding, event)).toEqual(rests(flooding));
		}
		const after = stepFlow(flooding, { type: "covered" }).state;
		expect(stepFlow(after, { type: "retryPressed", color: BLUE, at: AT }).flood).toBeDefined();
	});

	it("the bowl settling from the pause ignores the play dot while its flood runs", () => {
		const step = stepFlow(open("pause"), {
			type: "settled",
			zero: ZERO,
			facingDown: false,
			at: AT,
		});
		expect(stepFlow(step.state, { type: "cornerPressed", tiltAvailable: true })).toEqual(
			rests(step.state),
		);
		expect(
			stepFlow(step.state, { type: "settled", zero: ZERO, facingDown: false, at: AT }),
		).toEqual(rests(step.state));
	});

	it("a phase change is recorded and answers with that phase's screen", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "phaseChanged", phase: "RUNNING" });
		expect(step).toEqual({ state: { ...INITIAL_FLOW, phase: "RUNNING" }, screen: { kind: "hud" } });
	});

	it("a phase change still lands while a flood runs, and the flood covering keeps it", () => {
		const flooding = stepFlow(INITIAL_FLOW, { type: "retryPressed", color: BLUE, at: AT }).state;
		const paused = stepFlow(flooding, { type: "phaseChanged", phase: "PAUSED" }).state;
		expect(paused).toEqual({ ...flooding, phase: "PAUSED" });
		expect(stepFlow(paused, { type: "covered" }).state).toEqual({
			...INITIAL_FLOW,
			phase: "PAUSED",
		});
	});

	it("every step answers with the screen of the state it leaves", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "levelPressed", from: "menu", color: BLUE });
		expect(step.screen).toEqual({ kind: "settle", color: BLUE });
		expect(stepFlow(step.state, { type: "settleBacked" }).screen).toEqual({ kind: "title" });
	});
});

describe("which screen shows", () => {
	const PHASES: readonly GamePhase[] = ["KIOSK", "RUNNING", "REJECTING", "PAUSED", "GAME_OVER"];
	const SETTLES = [null, "start", "menu", "pause"] as const;
	const OVER_PAUSE = [
		null,
		{ kind: "speed", color: BLUE },
		{ kind: "getReady" },
	] as const satisfies readonly FlowState["overPause"][];
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
		Record<NonNullable<(typeof SETTLES)[number]> | "none", [Screen, Screen, Screen]>
	> = {
		// [nothing over the pause, speed view, Get ready]; both only open over the pause
		KIOSK: {
			none: [title, title, title], // impossible: speed or Get ready over the title
			start: [bowl, bowl, bowl], // a first PLAY; speed, Get ready: impossible
			menu: [bowl, bowl, bowl], // the level button on the title; speed, Get ready: impossible
			pause: [title, title, title], // impossible: the pause's bowl over the title
		},
		RUNNING: {
			none: [hud, hud, hud], // speed, Get ready: impossible
			start: [hud, hud, hud], // impossible: a bowl over a running game
			menu: [hud, hud, hud], // impossible
			pause: [hud, hud, hud], // impossible
		},
		REJECTING: {
			none: [hud, hud, hud], // speed, Get ready: impossible
			start: [hud, hud, hud], // impossible
			menu: [hud, hud, hud], // impossible
			pause: [hud, hud, hud], // impossible
		},
		PAUSED: {
			none: [pause, speed, getReady],
			start: [pause, speed, getReady], // impossible: the title's bowl over the pause
			menu: [pause, speed, getReady], // impossible
			// the level button on the pause; with speed or Get ready: impossible
			pause: [bowl, bowl, bowl],
		},
		GAME_OVER: {
			none: [gameOver, gameOver, gameOver], // speed, Get ready: impossible
			start: [gameOver, gameOver, gameOver], // impossible
			menu: [gameOver, gameOver, gameOver], // impossible
			pause: [gameOver, gameOver, gameOver], // impossible
		},
	};

	for (const phase of PHASES) {
		for (const from of SETTLES) {
			OVER_PAUSE.forEach((overPause, i) => {
				for (const flooding of FLOODS) {
					const state: FlowState = {
						phase,
						settle: from ? { from, color: PINK } : null,
						overPause,
						flooding,
					};
					const expected = EXPECTED[phase][from ?? "none"][i];
					it(`${phase}, bowl ${from ?? "closed"}, over the pause ${overPause?.kind ?? "nothing"}${flooding ? ", flooding" : ""}: ${expected.kind}`, () => {
						expect(screenOf(state)).toEqual(expected);
					});
				}
			});
		}
	}
});

describe("the corner dot", () => {
	it("pauses in play, plays on the pause screen and pauses again in Get ready, in the one spot", () => {
		expect(cornerDot({ kind: "hud" })).toBe("pause");
		expect(cornerDot({ kind: "pause" })).toBe("play");
		expect(cornerDot({ kind: "getReady" })).toBe("pause");
	});

	it("is not there on the title, the bowl, the speed view or the game over", () => {
		expect(cornerDot({ kind: "title" })).toBeNull();
		expect(cornerDot({ kind: "settle", color: PINK })).toBeNull();
		expect(cornerDot({ kind: "speed", color: PINK })).toBeNull();
		expect(cornerDot({ kind: "gameOver" })).toBeNull();
	});
});
