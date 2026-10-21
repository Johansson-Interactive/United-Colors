/**
 * Pure state machine behind the screens: the title, the settle bowl, the pause, the speed
 * view, Get ready and the game over, and the floods between them. A flood is a dot growing from under the finger until it
 * covers the screen; the scene changes underneath, then it lifts. A first game starts by
 * setting the level pose; the settled dot then floods into play. Setting it again from the title
 * or the pause only saves it and returns there. While a flood is on its way
 * the screen under it is already decided, so taps on that screen are ignored. The game's phase
 * comes in as an event too, and every step answers with the one screen to show. While the bowl
 * or the speed view is open over the title the kiosk halts. A paused run continues through Get ready: the game
 * stays paused until the player has held level, then resumes with no flood.
 */

import type { GamePhase, TiltZero } from "../../domain/types";
import type { PressPoint } from "../components/DotButton";
import { INK_LIFT } from "../theme/theme";

/** Where the settle bowl was opened from, which decides where play continues afterwards */
type SettleFrom = "start" | "pause" | "menu";

/**
 * Where the level bowl or the speed view was opened from: the title's menu, with the colour the
 * play dot showed at the tap, or the pause, whose views open in the player's colour
 */
export type MenuOpening = { from: "menu"; color: string } | { from: "pause" };

/** The settle bowl is open: where play continues afterwards, and the colour of its dot */
interface SettleRequest {
	from: SettleFrom;
	color: string;
}

/**
 * A screen in place of the title's or the pause's own: the speed view, opened from either, its
 * dot in the colour play takes; or, over the pause, Get ready, where the player holds level
 * until play resumes
 */
type Over = { kind: "speed"; from: MenuOpening["from"]; color: string } | { kind: "getReady" };

export interface FlowState {
	/** The game's phase, as the session last reported it */
	phase: GamePhase;
	settle: SettleRequest | null;
	over: Over | null;
	/** A flood is growing towards covering the screen */
	flooding: boolean;
	/** The kiosk has been started, by the stage's first layout; later layouts leave it be */
	kioskStarted: boolean;
}

export const INITIAL_FLOW: FlowState = {
	phase: "KIOSK",
	settle: null,
	over: null,
	flooding: false,
	kioskStarted: false,
};

/** The one screen over the playfield; the HUD is the screen of a run in play */
export type Screen =
	| { kind: "title" }
	| { kind: "hud" }
	| { kind: "pause" }
	| { kind: "speed"; color: string }
	| { kind: "getReady" }
	| { kind: "settle"; color: string }
	| { kind: "gameOver" };

/**
 * What the game answers when the flow asks, as it steps. The taps carry only what the tap itself
 * knows; the rest is asked for here.
 */
export interface GameFacts {
	/** A level pose is set, so PLAY needs no bowl first */
	levelPoseSet: boolean;
	/** There is tilt to hold level with, so the pause's play dot goes through Get ready */
	tiltPresent: boolean;
	/** The player's colour, which play from the pause or the game over keeps */
	playerColor: string;
}

/**
 * The taps carry what the tap itself knows: where it landed, and on the title the colour the play
 * dot showed, which the run, the bowl's dot or the speed view's dot takes
 */
export type FlowEvent =
	/** PLAY on the title */
	| { type: "startPressed"; color: string; at: PressPoint }
	/**
	 * Not a tap: the bench run starts itself (see useAutoStart), straight into play with no bowl
	 * whether a level pose is set or not
	 */
	| { type: "autoStarted"; color: string; at: PressPoint }
	/** The level button on the title or the pause; from the pause the bowl's dot is the player's colour */
	| ({ type: "levelPressed" } & MenuOpening)
	/** The bowl's dot came to rest at `at`, with the screen facing up or down */
	| { type: "settled"; zero: TiltZero; facingDown: boolean; at: PressPoint }
	| { type: "settleBacked" }
	/** The speed button on the title or the pause; from the pause its dot is the player's colour */
	| ({ type: "speedPressed" } & MenuOpening)
	/** BACK on the speed view */
	| { type: "speedBacked" }
	/** RETRY on the game over; the next run keeps the player's colour */
	| { type: "retryPressed"; at: PressPoint }
	/** QUIT on the pause or BACK on the game over */
	| { type: "leavePressed"; at: PressPoint }
	/** The corner dot, which does what it shows (see cornerDot) */
	| { type: "cornerPressed" }
	/** The player left the app (home, app switcher, an incoming call) */
	| { type: "appLeft" }
	/** Get ready's hold completed: the ring closed on the player */
	| { type: "readyHeld" }
	/** The flood covers the screen; whatever was under it can go */
	| { type: "covered" }
	/** The game moved to another phase */
	| { type: "phaseChanged"; phase: GamePhase }
	/** The stage was laid out; only the first one starts the kiosk */
	| { type: "stageLaidOut" };

/** What the game does: straight away, or once a flood covers the screen */
export type FlowAction =
	| { kind: "play"; color: string }
	| { kind: "pause" }
	| { kind: "resume" }
	/** Start the kiosk afresh */
	| { kind: "startKiosk" }
	/** Stop the kiosk, so only the bowl over it moves (the stage look hides it) */
	| { kind: "haltKiosk" }
	/** Run the kiosk on from where it stopped */
	| { kind: "runKiosk" };

export interface FlowStep {
	state: FlowState;
	/** The screen to show for `state` */
	screen: Screen;
	/** Adopt this pose as level for the side the screen faced */
	calibrate?: { zero: TiltZero; facingDown: boolean };
	/** Do this to the game now */
	act?: FlowAction;
	/** Grow a dot of `color` from `at`; run `action` once it covers the screen */
	flood?: { color: string; at: PressPoint; action: FlowAction };
}

const play = (color: string): FlowAction => ({ kind: "play", color });
const RESUME: FlowAction = { kind: "resume" };
const PAUSE: FlowAction = { kind: "pause" };

/**
 * Over the title the drifting dots would pull the eye from the bowl's one dot, so the kiosk
 * halts while the bowl or the speed view is open; the pause already holds a frozen game. A game started from the bowl
 * replaces the kiosk under its flood, so only closing the bowl back to the title runs it again.
 */
const HALT_KIOSK: FlowAction = { kind: "haltKiosk" };
const RUN_KIOSK: FlowAction = { kind: "runKiosk" };

/**
 * The screen for a phase and the flow over it. The bowl and the speed view open over the
 * screen they were opened from, and Get ready over the pause; anywhere else they cannot be
 * open, and the phase's own screen shows. A flood leaves the screen under it as it is until it covers.
 */
export function screenOf(state: FlowState): Screen {
	const { phase, settle, over } = state;
	switch (phase) {
		case "KIOSK":
			if (settle && settle.from !== "pause") return { kind: "settle", color: settle.color };
			return over?.kind === "speed" && over.from === "menu"
				? { kind: "speed", color: over.color }
				: { kind: "title" };
		case "PAUSED":
			if (settle?.from === "pause") return { kind: "settle", color: settle.color };
			if (over?.kind === "getReady") return over;
			return over?.kind === "speed" && over.from === "pause"
				? { kind: "speed", color: over.color }
				: { kind: "pause" };
		case "RUNNING":
		case "REJECTING":
			return { kind: "hud" };
		case "GAME_OVER":
			return { kind: "gameOver" };
	}
}

/**
 * What the HUD's top-right dot shows on `screen`, or null where it is not there. It stays in
 * the one spot from play to the pause and Get ready, so the thumb that paused can carry on.
 */
export function cornerDot(screen: Screen): "pause" | "play" | null {
	switch (screen.kind) {
		case "hud":
		case "getReady":
			return "pause";
		case "pause":
			return "play";
		default:
			return null;
	}
}

/**
 * What can still step the flow in Get ready: the corner dot, leaving the app and the hold. No
 * flood can start from Get ready, so none can cover it.
 */
const GET_READY_EVENTS: ReadonlySet<FlowEvent["type"]> = new Set([
	"cornerPressed",
	"appLeft",
	"readyHeld",
]);

/** A step before its screen is worked out */
type BareStep = Omit<FlowStep, "screen">;

/** Start a flood; the state stays as it is underneath until the flood covers the screen */
const startFlood = (
	state: FlowState,
	flood: NonNullable<FlowStep["flood"]>,
	calibrate?: FlowStep["calibrate"],
): BareStep => ({
	state: { ...state, flooding: true },
	...(calibrate && { calibrate }),
	flood,
});

/** Back to the title or the pause screen from whatever is over it */
const closeOver = (state: FlowState): BareStep => ({ state: { ...state, over: null } });

/** The colour the bowl or the speed view opens in: the play dot's on the title, the player's on the pause */
const openingColor = (
	event: Extract<FlowEvent, { type: "levelPressed" | "speedPressed" }>,
	game: GameFacts,
) => (event.from === "menu" ? event.color : game.playerColor);

/** Step `event`, with `game` answering what the tap does not carry */
export function stepFlow(state: FlowState, event: FlowEvent, game: GameFacts): FlowStep {
	const step = bareStep(state, event, game);
	return { ...step, screen: screenOf(step.state) };
}

function bareStep(state: FlowState, event: FlowEvent, game: GameFacts): BareStep {
	// The phase is the game's to report, flood or not
	if (event.type === "phaseChanged") return { state: { ...state, phase: event.phase } };
	// The kiosk is the title's, so the first layout starts it even while a flood runs
	if (event.type === "stageLaidOut") {
		return state.kioskStarted
			? { state }
			: { state: { ...state, kioskStarted: true }, act: { kind: "startKiosk" } };
	}
	// The flood decides the next screen; nothing under it can change that
	if (state.flooding && event.type !== "covered") return { state };
	// Get ready shows only the hold; the pause's controls have faded out under it, and a hold
	// that lands once Get ready has closed is too late to count
	const gettingReady = state.over?.kind === "getReady";
	if (gettingReady ? !GET_READY_EVENTS.has(event.type) : event.type === "readyHeld") {
		return { state };
	}
	switch (event.type) {
		case "startPressed":
			return game.levelPoseSet
				? startFlood(state, { color: event.color, at: event.at, action: play(event.color) })
				: { state: { ...state, settle: { from: "start", color: event.color } }, act: HALT_KIOSK };
		case "autoStarted":
			return startFlood(state, { color: event.color, at: event.at, action: play(event.color) });
		case "levelPressed":
			return {
				state: { ...state, settle: { from: event.from, color: openingColor(event, game) } },
				...(event.from === "menu" && { act: HALT_KIOSK }),
			};
		case "settled": {
			const settle = state.settle;
			if (!settle) return { state };
			const calibrate = { zero: event.zero, facingDown: event.facingDown };
			// From the title the pose is only saved; the title comes straight back
			if (settle.from === "menu") {
				return { state: { ...state, settle: null }, calibrate, act: RUN_KIOSK };
			}
			// From the pause too: the pause screen comes back, so play never picks up unannounced;
			// the play dot then leads through Get ready as usual
			if (settle.from === "pause") return { state: { ...state, settle: null }, calibrate };
			// The bowl stays under the flood until it has covered the screen
			return startFlood(
				state,
				{ color: settle.color, at: event.at, action: play(settle.color) },
				calibrate,
			);
		}
		case "settleBacked":
			return {
				state: { ...state, settle: null },
				...(state.settle && state.settle.from !== "pause" && { act: RUN_KIOSK }),
			};
		case "speedPressed":
			return {
				state: {
					...state,
					over: { kind: "speed", from: event.from, color: openingColor(event, game) },
				},
				...(event.from === "menu" && { act: HALT_KIOSK }),
			};
		case "speedBacked": {
			const fromMenu = state.over?.kind === "speed" && state.over.from === "menu";
			return { ...closeOver(state), ...(fromMenu && { act: RUN_KIOSK }) };
		}
		case "retryPressed":
			return startFlood(state, {
				color: game.playerColor,
				at: event.at,
				action: play(game.playerColor),
			});
		case "leavePressed":
			return startFlood(state, { color: INK_LIFT, at: event.at, action: { kind: "startKiosk" } });
		case "cornerPressed":
			switch (cornerDot(screenOf(state))) {
				case "pause":
					// Get ready is over a game that is already paused; its pause dot only closes it
					return gettingReady ? closeOver(state) : { state, act: PAUSE };
				case "play":
					// Without tilt there is no level to hold, so nothing stands between the pause and play
					return game.tiltPresent
						? { state: { ...state, over: { kind: "getReady" } } }
						: { state, act: RESUME };
				default:
					return { state };
			}
		case "appLeft":
			// Back from away on the pause screen: a run in play pauses, and Get ready closes so a
			// hold cannot complete while the player is away
			if (gettingReady) return closeOver(state);
			return state.phase === "RUNNING" ? { state, act: PAUSE } : { state };
		case "readyHeld":
			// The hold is the countdown; play picks up the moment the thaw clears the field, no flood
			return { ...closeOver(state), act: RESUME };
		case "covered":
			// Covering clears the screen back to the title, but the kiosk stays started
			return {
				state: { ...INITIAL_FLOW, phase: state.phase, kioskStarted: state.kioskStarted },
			};
	}
}
