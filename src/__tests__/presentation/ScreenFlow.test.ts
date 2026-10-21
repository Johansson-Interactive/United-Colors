import type { GamePhase } from "../../domain/types";
import {
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
		const opened = stepFlow(PAUSED, { type: "speedPressed", from: "pause", color: BLUE });
		expect(opened).toEqual({
			state: { ...PAUSED, speed: { from: "pause", color: BLUE } },
			screen: { kind: "speed", color: BLUE },
		});
		expect(stepFlow(opened.state, { type: "speedBacked" })).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it("the speed view over the pause saves nothing and starts no flood, and leaves the kiosk alone", () => {
		const opened = stepFlow(PAUSED, { type: "speedPressed", from: "pause", color: PINK });
		expect(opened.calibrate).toBeUndefined();
		expect(opened.flood).toBeUndefined();
		expect(opened.act).toBeUndefined();
		expect(stepFlow(opened.state, { type: "speedBacked" }).act).toBeUndefined();
	});

	it("the speed button on the title opens the speed view in the play dot's colour, halting the kiosk", () => {
		const opened = stepFlow(INITIAL_FLOW, { type: "speedPressed", from: "menu", color: BLUE });
		expect(opened).toEqual({
			state: { ...INITIAL_FLOW, speed: { from: "menu", color: BLUE } },
			screen: { kind: "speed", color: BLUE },
			act: { kind: "haltKiosk" },
		});
		expect(stepFlow(opened.state, { type: "speedBacked" })).toEqual({
			state: INITIAL_FLOW,
			screen: { kind: "title" },
			act: { kind: "runKiosk" },
		});
	});

	it("a flood covering the screen closes the speed view too", () => {
		const opened = stepFlow(PAUSED, { type: "speedPressed", from: "pause", color: PINK }).state;
		expect(stepFlow(opened, { type: "covered" }).state).toEqual(PAUSED);
	});

	it("the pause dot and leaving the app pause the game, opening no screen", () => {
		const running: FlowState = { ...INITIAL_FLOW, phase: "RUNNING" };
		expect(stepFlow(running, { type: "pausePressed" })).toEqual({
			state: running,
			screen: { kind: "hud" },
			act: { kind: "pause" },
		});
	});

	it("the level ring, held or tapped, resumes the game", () => {
		expect(stepFlow(PAUSED, { type: "resumePressed" })).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
			act: { kind: "resume" },
		});
	});

	it("after QUIT starts the flood, the level ring completing does not resume; the flood still lands on the title", () => {
		const quit = stepFlow(INITIAL_FLOW, { type: "leavePressed", at: AT });
		expect(quit.state.flooding).toBe(true);
		const resume = stepFlow(quit.state, { type: "resumePressed" });
		expect(resume).toEqual(rests(quit.state));
		const covered = stepFlow(resume.state, { type: "covered" });
		expect(covered.state).toEqual(INITIAL_FLOW);
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
			{ type: "pausePressed" },
			{ type: "speedPressed", from: "menu", color: PINK },
			{ type: "levelPressed", from: "pause", color: PINK },
			{ type: "startPressed", color: PINK, hasZero: true, at: AT },
			{ type: "settleBacked" },
		] as const) {
			expect(stepFlow(flooding, event)).toEqual(rests(flooding));
		}
		const after = stepFlow(flooding, { type: "covered" }).state;
		expect(stepFlow(after, { type: "retryPressed", color: BLUE, at: AT }).flood).toBeDefined();
	});

	it("the bowl settling from the pause ignores a resume tap while its flood runs", () => {
		const step = stepFlow(open("pause"), {
			type: "settled",
			zero: ZERO,
			facingDown: false,
			at: AT,
		});
		expect(stepFlow(step.state, { type: "resumePressed" })).toEqual(rests(step.state));
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
	const SPEEDS = [null, "menu", "pause"] as const;
	const FLOODS = [false, true] as const;

	const title: Screen = { kind: "title" };
	const hud: Screen = { kind: "hud" };
	const pause: Screen = { kind: "pause" };
	const gameOver: Screen = { kind: "gameOver" };
	const bowl: Screen = { kind: "settle", color: PINK };
	const speed: Screen = { kind: "speed", color: BLUE };

	/**
	 * The expected screen for each phase and flow, written out by hand. The flood never decides
	 * the screen: the one under it stays until it covers. Combinations no tap sequence reaches
	 * (marked "impossible") resolve to the phase's own screen.
	 */
	const EXPECTED: Record<
		GamePhase,
		Record<NonNullable<(typeof SETTLES)[number]> | "none", [Screen, Screen, Screen]>
	> = {
		// [speed view closed, open from the title, open from the pause]; the bowl and the speed
		// view are never open together
		KIOSK: {
			none: [title, speed, title], // the speed button on the title; the pause's: impossible
			start: [bowl, bowl, bowl], // a first PLAY; speed: impossible
			menu: [bowl, bowl, bowl], // the level button on the title; speed: impossible
			pause: [title, speed, title], // impossible: the pause's bowl over the title
		},
		RUNNING: {
			none: [hud, hud, hud], // speed: impossible
			start: [hud, hud, hud], // impossible: a bowl over a running game
			menu: [hud, hud, hud], // impossible
			pause: [hud, hud, hud], // impossible
		},
		REJECTING: {
			none: [hud, hud, hud], // speed: impossible
			start: [hud, hud, hud], // impossible
			menu: [hud, hud, hud], // impossible
			pause: [hud, hud, hud], // impossible
		},
		PAUSED: {
			none: [pause, pause, speed], // the speed button on the pause; the title's: impossible
			start: [pause, pause, speed], // impossible: the title's bowl over the pause
			menu: [pause, pause, speed], // impossible
			pause: [bowl, bowl, bowl], // the level button on the pause; with speed: impossible
		},
		GAME_OVER: {
			none: [gameOver, gameOver, gameOver], // speed: impossible
			start: [gameOver, gameOver, gameOver], // impossible
			menu: [gameOver, gameOver, gameOver], // impossible
			pause: [gameOver, gameOver, gameOver], // impossible
		},
	};

	for (const phase of PHASES) {
		for (const from of SETTLES) {
			for (const speedFrom of SPEEDS) {
				for (const flooding of FLOODS) {
					const state: FlowState = {
						phase,
						settle: from ? { from, color: PINK } : null,
						speed: speedFrom ? { from: speedFrom, color: BLUE } : null,
						flooding,
					};
					const expected = EXPECTED[phase][from ?? "none"][SPEEDS.indexOf(speedFrom)];
					it(`${phase}, bowl ${from ?? "closed"}, speed ${speedFrom ?? "closed"}${flooding ? ", flooding" : ""}: ${expected.kind}`, () => {
						expect(screenOf(state)).toEqual(expected);
					});
				}
			}
		}
	}
});
