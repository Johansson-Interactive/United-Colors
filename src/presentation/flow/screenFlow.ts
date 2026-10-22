/**
 * Pure state machine behind the screens: the title, the settle bowl, the pause, the speed
 * view, Get ready and the game over, and the floods between them. A flood is a dot growing from
 * under the finger until it covers the screen; the scene changes underneath, then it lifts. A
 * first game starts by setting the level pose; the settled dot then floods into play. Setting it
 * again from the title or the pause only saves it and returns there. While a flood is on its way
 * the screen under it is already decided, so taps on that screen are ignored. The game's phase
 * comes in as an event too, and every step answers with the one screen to show. While the bowl
 * or the speed view is open over the title the kiosk halts.
 *
 * The field itself is the way in and out of the pause (see GLOSSARY.md). A finger held on the
 * field in play freezes the game at once and blooms frost from under it; the pause screen
 * opens once the frost covers the field, and a finger lifted before then lets play go on. On
 * the pause screen a finger on the frost opens Get ready and holds it open: the game stays
 * paused until the player has held level, then resumes with no flood; a finger lifted before
 * then shuts the window and the pause screen comes back.
 */

import type { GamePhase, TiltZero } from "../../domain/types";
import type { PressPoint } from "../components/DotButton";
import type { Point } from "../effects/frost";
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
 * dot in the colour play takes; or, over the pause, Get ready, held open by the finger that
 * touched the frost, where the player holds level until play resumes
 */
type Over = { kind: "speed"; from: MenuOpening["from"]; color: string } | { kind: "getReady" };

export interface FlowState {
	/** The game's phase, as the session last reported it */
	phase: GamePhase;
	settle: SettleRequest | null;
	over: Over | null;
	/** A flood is growing towards covering the screen */
	flooding: boolean;
	/**
	 * A finger on the field is frosting the frozen run from where it landed; the pause screen
	 * opens once the frost covers the field (see frostBloom.ts)
	 */
	bloom: Point | null;
	/** The kiosk has been started, by the stage's first layout; later layouts leave it be */
	kioskStarted: boolean;
	/** Score slivers are still on their way into the score; the game over waits for the last */
	sliversInAir: boolean;
}

export const INITIAL_FLOW: FlowState = {
	phase: "KIOSK",
	settle: null,
	over: null,
	flooding: false,
	bloom: null,
	kioskStarted: false,
	sliversInAir: false,
};

/**
 * The one screen over the playfield; the HUD is the screen of a run in play, and stays while
 * the bloom frosts the frozen run from under the finger at `at`
 */
export type Screen =
	| { kind: "title" }
	| { kind: "hud" }
	| { kind: "frosting"; at: Point }
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
	/** There is tilt to hold level with, so a touch on the frost goes through Get ready */
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
	/**
	 * A finger landed on the field at `at` (stage px), clear of any button: in play it freezes
	 * the run and blooms frost from there; on the pause screen it opens Get ready, held
	 */
	| { type: "fieldTouched"; at: Point }
	/** The bloom's frost covers the field: the pause screen opens */
	| { type: "bloomCovered" }
	/** The finger lifted before the frost covered the field, and the frost has drained: play goes on */
	| { type: "bloomCleared" }
	/** Dev only: the corner pause dot, kept where touch steers the dot instead of the gyro */
	| { type: "pausePressed" }
	/** The player left the app (home, app switcher, an incoming call) */
	| { type: "appLeft" }
	/** Get ready's hold completed: the thaw cleared the field */
	| { type: "readyHeld" }
	/** The finger lifted before the field was clear, and Get ready's window has shut */
	| { type: "readyShut" }
	/** The flood covers the screen; whatever was under it can go */
	| { type: "covered" }
	/** The game moved to another phase */
	| { type: "phaseChanged"; phase: GamePhase }
	/** Score slivers came into the air, or the last of them arrived at the score */
	| { type: "sliversChanged"; inAir: boolean }
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
 * open, and the phase's own screen shows. A flood leaves the screen under it as it is until it
 * covers. The bloom keeps the HUD up over the run it is freezing, so the pause screen opens
 * only once the frost has covered the field, and a run's end keeps it up until the last of
 * its score slivers has arrived, so the game over opens on the score complete.
 */
export function screenOf(state: FlowState): Screen {
	const { phase, settle, over, bloom, sliversInAir } = state;
	if (bloom && (phase === "RUNNING" || phase === "PAUSED")) return { kind: "frosting", at: bloom };
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
			return sliversInAir ? { kind: "hud" } : { kind: "gameOver" };
	}
}

/**
 * What can still step the flow in Get ready: leaving the app, the hold and the window shutting.
 * Its finger is already down, so no tap can land, and no flood can start from it.
 */
const GET_READY_EVENTS: ReadonlySet<FlowEvent["type"]> = new Set([
	"appLeft",
	"readyHeld",
	"readyShut",
]);

/**
 * What can still step the flow while the bloom frosts the field: leaving the app and the
 * bloom's own ends. The HUD has no buttons, and the finger is already down.
 */
const BLOOM_EVENTS: ReadonlySet<FlowEvent["type"]> = new Set([
	"appLeft",
	"bloomCovered",
	"bloomCleared",
]);

/** The events only Get ready or the bloom can answer; landing anywhere else they are too late */
const HOLD_EVENTS: ReadonlySet<FlowEvent["type"]> = new Set([
	"readyHeld",
	"readyShut",
	"bloomCovered",
	"bloomCleared",
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

/** The bloom is over, one way or the other */
const endBloom = (state: FlowState): FlowState => ({ ...state, bloom: null });

/** Whether `phase` has a run the bloom can be frosting: in play, or frozen by it */
const bloomable = (phase: GamePhase) => phase === "RUNNING" || phase === "PAUSED";

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
	// The phase is the game's to report, flood or not; a run that ends under the bloom (its
	// refusal was already playing out as the finger landed) takes the bloom with it
	if (event.type === "phaseChanged") {
		const bloom = bloomable(event.phase) ? state.bloom : null;
		return { state: { ...state, phase: event.phase, bloom } };
	}
	// So are the slivers, which only the score meter sees land
	if (event.type === "sliversChanged") {
		return { state: { ...state, sliversInAir: event.inAir } };
	}
	// The kiosk is the title's, so the first layout starts it even while a flood runs
	if (event.type === "stageLaidOut") {
		return state.kioskStarted
			? { state }
			: { state: { ...state, kioskStarted: true }, act: { kind: "startKiosk" } };
	}
	// The flood decides the next screen; nothing under it can change that
	if (state.flooding && event.type !== "covered") return { state };
	// Get ready and the bloom each answer only their own events; the pause's controls have
	// faded out under Get ready, and a hold that lands once either has closed is too late
	const gettingReady = state.over?.kind === "getReady";
	const blooming = state.bloom !== null;
	if (gettingReady && !GET_READY_EVENTS.has(event.type)) return { state };
	if (blooming && !BLOOM_EVENTS.has(event.type)) return { state };
	if (!gettingReady && !blooming && HOLD_EVENTS.has(event.type)) return { state };
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
		case "fieldTouched": {
			const screen = screenOf(state);
			// The run freezes the moment the finger lands; the frost then grows from under it
			if (screen.kind === "hud" && state.phase === "RUNNING") {
				return { state: { ...state, bloom: event.at }, act: PAUSE };
			}
			if (screen.kind !== "pause") return { state };
			// Without tilt there is no level to hold, so nothing stands between the pause and play
			return game.tiltPresent
				? { state: { ...state, over: { kind: "getReady" } } }
				: { state, act: RESUME };
		}
		case "bloomCovered":
			return { state: endBloom(state) };
		case "bloomCleared":
			// The frozen frame is where play goes on from; the pose has not had time to change
			return { state: endBloom(state), act: RESUME };
		case "pausePressed":
			return screenOf(state).kind === "hud" && state.phase === "RUNNING"
				? { state, act: PAUSE }
				: { state };
		case "appLeft":
			// Back from away on the pause screen: a run in play pauses, the bloom's frozen run keeps
			// the pause it already has, and Get ready closes so a hold cannot complete while the
			// player is away
			if (gettingReady) return closeOver(state);
			if (blooming) return { state: endBloom(state) };
			return state.phase === "RUNNING" ? { state, act: PAUSE } : { state };
		case "readyHeld":
			// The hold is the countdown; play picks up the moment the thaw clears the field, no flood
			return { ...closeOver(state), act: RESUME };
		case "readyShut":
			return closeOver(state);
		case "covered":
			// Covering clears the screen back to the title, but the kiosk stays started
			return {
				state: {
					...INITIAL_FLOW,
					phase: state.phase,
					kioskStarted: state.kioskStarted,
					sliversInAir: state.sliversInAir,
				},
			};
	}
}
