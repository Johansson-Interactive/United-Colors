import type { GamePhase } from "../../domain/types";
import {
	type FlowEvent,
	type FlowState,
	type GameFacts,
	INITIAL_FLOW,
	type Screen,
	screenOf,
	stepFlow,
} from "../../presentation/flow/screenFlow";
import { INK_LIFT } from "../../presentation/theme/theme";

const AT = { x: 10, y: 20 };
const PINK = "#E91E63";
const BLUE = "#2196F3";

/** What the game answers unless a test says otherwise: tilt, a pink player */
const GAME: GameFacts = { tiltPresent: true, playerColor: PINK };

const RUNNING: FlowState = { ...INITIAL_FLOW, phase: "RUNNING" };
const PAUSED: FlowState = { ...INITIAL_FLOW, phase: "PAUSED" };
/** A finger on the field has frozen the run and is opening the portal into the pause at the seat */
const FROSTING: FlowState = { ...PAUSED, bloom: "finger" };
const GET_READY: FlowState = { ...PAUSED, over: { kind: "getReady" } };

/** The flood into a blue game from AT, started from the title */
const START_BLUE = {
	color: BLUE,
	at: AT,
	action: { kind: "play", color: BLUE },
} as const;

/** A step that only leaves the flow in `state`, showing its screen */
const rests = (state: FlowState) => ({ state, screen: screenOf(state) });

describe("score slivers at a run's end", () => {
	const IN_AIR: FlowState = { ...RUNNING, sliversInAir: true };

	it("keeps the HUD up after the run ends until the last sliver has arrived", () => {
		const over = stepFlow(IN_AIR, { type: "phaseChanged", phase: "GAME_OVER" }, GAME);
		expect(over.screen).toEqual({ kind: "hud" });
		const landed = stepFlow(over.state, { type: "sliversChanged", inAir: false }, GAME);
		expect(landed.state).toEqual({ ...INITIAL_FLOW, phase: "GAME_OVER" });
		expect(landed.screen).toEqual({ kind: "gameOver" });
	});

	it("opens the game over at once when nothing is in the air", () => {
		const over = stepFlow(RUNNING, { type: "phaseChanged", phase: "GAME_OVER" }, GAME);
		expect(over.screen).toEqual({ kind: "gameOver" });
	});

	it("follows the slivers whatever the screen, a flood included", () => {
		const flooding = { ...RUNNING, flooding: true };
		const step = stepFlow(flooding, { type: "sliversChanged", inAir: true }, GAME);
		expect(step.state).toEqual({ ...flooding, sliversInAir: true });
		expect(step.screen).toEqual({ kind: "hud" });
	});

	it("never pauses the run on the held game over", () => {
		const held = { ...IN_AIR, phase: "GAME_OVER" as const };
		expect(stepFlow(held, { type: "fieldTouched", landedAt: 0 }, GAME)).toEqual({
			state: held,
			screen: { kind: "hud" },
		});
	});

	it("keeps knowing what is in the air through a flood's cover", () => {
		const covered = stepFlow({ ...IN_AIR, flooding: true }, { type: "covered" }, GAME);
		expect(covered.state.sliversInAir).toBe(true);
	});
});

describe("screen flow", () => {
	it("PLAY floods into a game in that colour, leaving the level pose to the run it starts", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "startPressed", color: BLUE, at: AT }, GAME);
		expect(step.state).toEqual({ ...INITIAL_FLOW, flooding: true });
		expect(step.flood).toEqual(START_BLUE);
		expect(step.takeLevelPose).toBeUndefined();
	});

	it("RETRY floods into a new game in the player's colour", () => {
		const step = stepFlow(
			INITIAL_FLOW,
			{ type: "retryPressed", at: AT },
			{ ...GAME, playerColor: BLUE },
		);
		expect(step.takeLevelPose).toBeUndefined();
		expect(step.flood).toEqual({
			color: BLUE,
			at: AT,
			action: { kind: "play", color: BLUE },
		});
	});

	it("QUIT and BACK flood in ink to the title", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "leavePressed", at: AT }, GAME);
		expect(step.flood).toEqual({ color: INK_LIFT, at: AT, action: { kind: "startKiosk" } });
	});

	it("PLAY leaves the kiosk to the game it floods into", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "startPressed", color: BLUE, at: AT }, GAME);
		expect(step.act).toBeUndefined();
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
		expect(opened.takeLevelPose).toBeUndefined();
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

	it("a finger on the field in play freezes the run at once and opens the portal into the pause, held by the finger", () => {
		expect(stepFlow(RUNNING, { type: "fieldTouched", landedAt: 0 }, GAME)).toEqual({
			state: { ...RUNNING, bloom: "finger" },
			screen: { kind: "frosting", start: "finger" },
			act: { kind: "pause" },
		});
	});

	it("the bloom keeps the HUD up while the game reports the pause it asked for", () => {
		const frosting = stepFlow(RUNNING, { type: "fieldTouched", landedAt: 0 }, GAME).state;
		const paused = stepFlow(frosting, { type: "phaseChanged", phase: "PAUSED" }, GAME);
		expect(paused.state).toEqual(FROSTING);
		expect(paused.screen).toEqual({ kind: "frosting", start: "finger" });
	});

	it("the frost covering the field opens the pause screen, with nothing more to do to the game", () => {
		expect(stepFlow(FROSTING, { type: "bloomCovered" }, GAME)).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
		});
	});

	it("a finger lifted before the frost covers the field lets play go on from the frozen frame", () => {
		const cleared = stepFlow(
			FROSTING,
			{ type: "bloomCleared", liftedAt: 0, relanded: false },
			GAME,
		);
		expect(cleared.screen).toEqual({ kind: "pause" });
		expect(cleared.act).toEqual({ kind: "resume" });
	});

	it("under the bloom there are no buttons to press, and a second finger starts nothing", () => {
		for (const event of [
			{ type: "fieldTouched", landedAt: 0 },
			{ type: "leavePressed", at: AT },
			{ type: "speedPressed", from: "pause" },
			{ type: "pausePressed" },
			{ type: "readyHeld" },
			{ type: "readyShut" },
		] as const) {
			expect(stepFlow(FROSTING, event, GAME)).toEqual(rests(FROSTING));
		}
	});

	it("a run that ends under the bloom takes the bloom with it", () => {
		const frosting = stepFlow(RUNNING, { type: "fieldTouched", landedAt: 0 }, GAME).state;
		const over = stepFlow(frosting, { type: "phaseChanged", phase: "GAME_OVER" }, GAME);
		expect(over.state).toEqual({ ...INITIAL_FLOW, phase: "GAME_OVER" });
		expect(over.screen).toEqual({ kind: "gameOver" });
	});

	it("a finger on the pause screen opens Get ready, held", () => {
		expect(stepFlow(PAUSED, { type: "fieldTouched", landedAt: 0 }, GAME)).toEqual({
			state: GET_READY,
			screen: { kind: "getReady" },
		});
	});

	it("with no tilt to hold level with, a finger on the frost resumes the game straight away", () => {
		expect(
			stepFlow(PAUSED, { type: "fieldTouched", landedAt: 0 }, { ...GAME, tiltPresent: false }),
		).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
			act: { kind: "resume" },
		});
	});

	it("the cup shutting after the finger lifts closes Get ready back to the pause screen", () => {
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
			{ ...PAUSED, over: { kind: "speed", from: "pause", color: PINK } },
		];
		for (const state of elsewhere) {
			expect(stepFlow(state, { type: "fieldTouched", landedAt: 0 }, GAME)).toEqual(rests(state));
		}
	});

	it("the dev pause dot freezes a run in play and plays the whole bloom with no finger to hold it", () => {
		expect(stepFlow(RUNNING, { type: "pausePressed" }, GAME)).toEqual({
			state: { ...RUNNING, bloom: "pauseDot" },
			screen: { kind: "frosting", start: "pauseDot" },
			act: { kind: "pause" },
		});
		const paused = stepFlow(
			stepFlow(RUNNING, { type: "pausePressed" }, GAME).state,
			{ type: "phaseChanged", phase: "PAUSED" },
			GAME,
		).state;
		expect(stepFlow(paused, { type: "bloomCovered" }, GAME).screen).toEqual({ kind: "pause" });
	});

	it("the dev pause dot does nothing anywhere but a run in play", () => {
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

	it("the ready hold completing closes Get ready and resumes the game from the grip it settled in, with no flood", () => {
		expect(stepFlow(GET_READY, { type: "readyHeld" }, GAME)).toEqual({
			state: PAUSED,
			screen: { kind: "pause" },
			act: { kind: "resume" },
			takeLevelPose: true,
		});
	});

	it("the speed view opens only from the pause screen, not from Get ready", () => {
		const event = { type: "speedPressed", from: "pause" } as const;
		expect(stepFlow(PAUSED, event, GAME).screen.kind).not.toBe("pause");
		expect(stepFlow(GET_READY, event, GAME)).toEqual(rests(GET_READY));
	});

	it("a hold's word landing after Get ready or the bloom has closed is too late to count", () => {
		for (const event of [
			{ type: "readyHeld" },
			{ type: "readyShut" },
			{ type: "bloomCovered" },
			{ type: "bloomCleared", liftedAt: 0, relanded: false },
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
			{ type: "fieldTouched", landedAt: 0 },
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
			{ type: "fieldTouched", landedAt: 0 },
			{ type: "appLeft" },
			{ type: "speedPressed", from: "menu", color: PINK },
			{ type: "startPressed", color: PINK, at: AT },
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
		const step = stepFlow(INITIAL_FLOW, { type: "speedPressed", from: "menu", color: BLUE }, GAME);
		expect(step.screen).toEqual({ kind: "speed", color: BLUE });
		expect(stepFlow(step.state, { type: "speedBacked" }, GAME).screen).toEqual({ kind: "title" });
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
	const speed: Screen = { kind: "speed", color: BLUE };
	const getReady: Screen = { kind: "getReady" };

	/**
	 * The expected screen for each phase and what is over it, written out by hand: [nothing,
	 * the speed view from the title, the speed view from the pause, Get ready]. The flood never
	 * decides the screen: the one under it stays until it covers. Combinations no tap sequence
	 * reaches (marked "impossible") resolve to the phase's own screen.
	 */
	const EXPECTED: Record<GamePhase, [Screen, Screen, Screen, Screen]> = {
		KIOSK: [title, speed, title, title], // the pause's speed view, Get ready: impossible
		RUNNING: [hud, hud, hud, hud], // speed, Get ready: impossible
		REJECTING: [hud, hud, hud, hud], // speed, Get ready: impossible
		PAUSED: [pause, pause, speed, getReady], // the title's speed view: impossible
		GAME_OVER: [gameOver, gameOver, gameOver, gameOver], // speed, Get ready: impossible
	};

	for (const phase of PHASES) {
		OVERS.forEach((over, i) => {
			for (const flooding of FLOODS) {
				const state: FlowState = {
					phase,
					over,
					flooding,
					bloom: null,
					earlyLift: null,
					kioskStarted: false,
					sliversInAir: false,
				};
				const expected = EXPECTED[phase][i];
				const overName = over
					? over.kind === "speed"
						? `speed from ${over.from}`
						: over.kind
					: "nothing";
				it(`${phase}, over it ${overName}${flooding ? ", flooding" : ""}: ${expected.kind}`, () => {
					expect(screenOf(state)).toEqual(expected);
				});
			}
		});
	}
});

describe("the bloom's screen", () => {
	it("keeps the HUD up, frosting, over a run in play or frozen by it", () => {
		for (const phase of ["RUNNING", "PAUSED"] as const) {
			expect(screenOf({ ...INITIAL_FLOW, phase, bloom: "finger" })).toEqual({
				kind: "frosting",
				start: "finger",
			});
		}
	});

	it("gives way to the phase's own screen anywhere else", () => {
		expect(screenOf({ ...INITIAL_FLOW, bloom: "finger" })).toEqual({ kind: "title" });
		expect(screenOf({ ...INITIAL_FLOW, phase: "REJECTING", bloom: "finger" })).toEqual({
			kind: "hud",
		});
		expect(screenOf({ ...INITIAL_FLOW, phase: "GAME_OVER", bloom: "finger" })).toEqual({
			kind: "gameOver",
		});
	});
});

describe("a second touch soon after an early lift", () => {
	/** When the finger lifted early */
	const LIFT = 50_000;

	/** Events in turn from `state`, as the game reports its phases back; the last step */
	const steps = (state: FlowState, events: FlowEvent[], game = GAME) =>
		events.reduce((step, event) => stepFlow(step.state, event, game), rests(state));

	const touch = (landedAt: number): FlowEvent => ({ type: "fieldTouched", landedAt });
	const phase = (to: GamePhase): FlowEvent => ({ type: "phaseChanged", phase: to });

	/** A run back in play after a finger landed and lifted early at LIFT, its portal drained */
	const afterLift = steps(RUNNING, [
		touch(LIFT - 120),
		phase("PAUSED"),
		{ type: "bloomCleared", liftedAt: LIFT, relanded: false },
		phase("RUNNING"),
	]).state;

	it("opens the pause whole, from under the finger, when the finger lands within the second", () => {
		expect(stepFlow(afterLift, touch(LIFT + 999), GAME)).toMatchObject({
			screen: { kind: "frosting", start: "secondTouch" },
			act: { kind: "pause" },
		});
	});

	it("counts the second from the lift, however long the first touch held", () => {
		const longHold = steps(RUNNING, [
			touch(LIFT - 800),
			phase("PAUSED"),
			{ type: "bloomCleared", liftedAt: LIFT, relanded: false },
			phase("RUNNING"),
			touch(LIFT + 999),
		]);
		expect(longHold.screen).toEqual({ kind: "frosting", start: "secondTouch" });
	});

	it.each([1000, 1001, 5000])(
		"is an ordinary bloom, following the hold, %i ms after the lift",
		(ms) => {
			expect(stepFlow(afterLift, touch(LIFT + ms), GAME)).toMatchObject({
				screen: { kind: "frosting", start: "finger" },
				act: { kind: "pause" },
			});
		},
	);

	it("hands a drained bloom straight on to a second touch's when a finger is down again as it clears", () => {
		const frosting = steps(RUNNING, [touch(LIFT - 120), phase("PAUSED")]).state;
		// The landing came under the bloom, too late for its stepper, so the flow let it be
		const underBloom = stepFlow(frosting, touch(LIFT + 30), GAME).state;
		const relanded = stepFlow(
			underBloom,
			{ type: "bloomCleared", liftedAt: LIFT, relanded: true },
			GAME,
		);
		// The run stays frozen: no play between the two blooms, and a new start to open afresh on
		expect(relanded.act).toBeUndefined();
		expect(relanded.screen).toEqual({ kind: "frosting", start: "secondTouch" });
		expect(stepFlow(relanded.state, { type: "bloomCovered" }, GAME).screen).toEqual({
			kind: "pause",
		});
	});

	it("leaves the dev pause dot's bloom as it was", () => {
		expect(stepFlow(afterLift, { type: "pausePressed" }, GAME).screen).toEqual({
			kind: "frosting",
			start: "pauseDot",
		});
	});

	it("leaves nothing behind once its bloom covers: Get ready resumes into an ordinary bloom", () => {
		const resumed = steps(afterLift, [
			touch(LIFT + 100),
			phase("PAUSED"),
			{ type: "bloomCovered" },
			touch(LIFT + 300),
			{ type: "readyHeld" },
			phase("RUNNING"),
		]);
		expect(resumed.screen).toEqual({ kind: "hud" });
		expect(stepFlow(resumed.state, touch(LIFT + 600), GAME).screen).toEqual({
			kind: "frosting",
			start: "finger",
		});
	});

	it("leaves nothing behind once its bloom covers, on a device without tilt either", () => {
		const noTilt = { ...GAME, tiltPresent: false };
		const resumed = steps(
			afterLift,
			[
				touch(LIFT + 100),
				phase("PAUSED"),
				{ type: "bloomCovered" },
				touch(LIFT + 300),
				phase("RUNNING"),
			],
			noTilt,
		);
		expect(stepFlow(resumed.state, touch(LIFT + 600), noTilt).screen).toEqual({
			kind: "frosting",
			start: "finger",
		});
	});

	it("is forgotten when the run ends, so the next run starts clean", () => {
		const nextRun = steps(afterLift, [
			phase("REJECTING"),
			phase("GAME_OVER"),
			{ type: "retryPressed", at: AT },
			{ type: "covered" },
			phase("RUNNING"),
		]);
		expect(stepFlow(nextRun.state, touch(LIFT + 600), GAME).screen).toEqual({
			kind: "frosting",
			start: "finger",
		});
	});

	it("is forgotten on leaving the app, which lands on the pause as before", () => {
		const away = stepFlow(afterLift, { type: "appLeft" }, GAME);
		expect(away.act).toEqual({ kind: "pause" });
		const back = steps(away.state, [
			phase("PAUSED"),
			touch(LIFT + 200),
			{ type: "readyHeld" },
			phase("RUNNING"),
		]);
		expect(stepFlow(back.state, touch(LIFT + 400), GAME).screen).toEqual({
			kind: "frosting",
			start: "finger",
		});
	});
});
