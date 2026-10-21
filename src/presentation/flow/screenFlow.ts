/**
 * Pure state machine behind the screens: the title, the settle bowl, the pause, the speed
 * view, Get ready and the game over, and the floods between them. A flood is a dot growing from under the finger until it
 * covers the screen; the scene changes underneath, then it lifts. A first game starts by
 * setting the level pose; the settled dot then floods into play. While a flood is on its way
 * the screen under it is already decided, so taps on that screen are ignored. The game's phase
 * comes in as an event too, and every step answers with the one screen to show. While the bowl
 * is open over the title the kiosk halts. A paused run continues through Get ready: the game
 * stays paused until the player has held level, then resumes with no flood.
 */

import type { GamePhase, TiltZero } from "../../domain/types";
import type { PressPoint } from "../components/DotButton";
import { INK_LIFT } from "../theme/theme";

/** Where the settle bowl was opened from, which decides where play continues afterwards */
type SettleFrom = "start" | "pause" | "menu";

/** The settle bowl is open: where play continues afterwards, and the colour of its dot */
interface SettleRequest {
	from: SettleFrom;
	color: string;
}

/**
 * A screen in place of the pause's own, over the frozen game: the speed view, its dot in the
 * player's colour, or Get ready, where the player holds level until play resumes
 */
type OverPause = Extract<Screen, { kind: "speed" | "getReady" }>;

export interface FlowState {
	/** The game's phase, as the session last reported it */
	phase: GamePhase;
	settle: SettleRequest | null;
	overPause: OverPause | null;
	/** A flood is growing towards covering the screen */
	flooding: boolean;
}

export const INITIAL_FLOW: FlowState = {
	phase: "KIOSK",
	settle: null,
	overPause: null,
	flooding: false,
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

export type FlowEvent =
	/** PLAY on the title, in the colour the play dot held; `hasZero`: a level pose is set */
	| { type: "startPressed"; color: string; hasZero: boolean; at: PressPoint }
	/** The level button on the title or the pause, in the colour the bowl's dot takes */
	| { type: "levelPressed"; from: "menu" | "pause"; color: string }
	/** The bowl's dot came to rest at `at`, with the screen facing up or down */
	| { type: "settled"; zero: TiltZero; facingDown: boolean; at: PressPoint }
	| { type: "settleBacked" }
	/** The speed button on the pause, in the player's colour */
	| { type: "speedPressed"; color: string }
	/** BACK on the speed view */
	| { type: "speedBacked" }
	/** RETRY on the game over, in the player's colour */
	| { type: "retryPressed"; color: string; at: PressPoint }
	/** QUIT on the pause or BACK on the game over */
	| { type: "leavePressed"; at: PressPoint }
	/** The pause dot on the HUD or in Get ready, or the player leaving the app mid-run */
	| { type: "pausePressed" }
	/** The play dot on the pause; `tiltAvailable`: there is tilt to hold level with */
	| { type: "playPressed"; tiltAvailable: boolean }
	/** Get ready's hold completed: the ring closed on the player */
	| { type: "readyHeld" }
	/** The flood covers the screen; whatever was under it can go */
	| { type: "covered" }
	/** The game moved to another phase */
	| { type: "phaseChanged"; phase: GamePhase };

/** What the game does: straight away, or once a flood covers the screen */
export type FlowAction =
	| { kind: "play"; color: string }
	| { kind: "pause" }
	| { kind: "resume" }
	| { kind: "kiosk" }
	/** Stop the kiosk and hide it, so only the bowl over it moves */
	| { kind: "haltKiosk" }
	/** Show the kiosk again and run it on from where it stopped */
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

/**
 * Over the title the drifting dots would pull the eye from the bowl's one dot, so the kiosk
 * halts while it is open; the pause already holds a frozen game. A game started from the bowl
 * replaces the kiosk under its flood, so only closing the bowl back to the title runs it again.
 */
const HALT_KIOSK: FlowAction = { kind: "haltKiosk" };
const RUN_KIOSK: FlowAction = { kind: "runKiosk" };

/**
 * The screen for a phase and the flow over it. The bowl opens over the screen it was opened
 * from, and the speed view and Get ready over the pause; anywhere else they cannot be open, and the phase's
 * own screen shows. A flood leaves the screen under it as it is until it covers.
 */
export function screenOf(state: FlowState): Screen {
	const { phase, settle, overPause } = state;
	switch (phase) {
		case "KIOSK":
			return settle && settle.from !== "pause"
				? { kind: "settle", color: settle.color }
				: { kind: "title" };
		case "PAUSED":
			if (settle?.from === "pause") return { kind: "settle", color: settle.color };
			return overPause ?? { kind: "pause" };
		case "RUNNING":
		case "REJECTING":
			return { kind: "hud" };
		case "GAME_OVER":
			return { kind: "gameOver" };
	}
}

/** What can still step the flow in Get ready: the pause dot (or leaving the app), the hold */
const GET_READY_EVENTS: ReadonlySet<FlowEvent["type"]> = new Set([
	"pausePressed",
	"readyHeld",
	"covered",
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

export function stepFlow(state: FlowState, event: FlowEvent): FlowStep {
	const step = bareStep(state, event);
	return { ...step, screen: screenOf(step.state) };
}

function bareStep(state: FlowState, event: FlowEvent): BareStep {
	// The phase is the game's to report, flood or not
	if (event.type === "phaseChanged") return { state: { ...state, phase: event.phase } };
	// The flood decides the next screen; nothing under it can change that
	if (state.flooding && event.type !== "covered") return { state };
	// Get ready shows only the hold; the pause's controls have faded out under it, and a hold
	// that lands once Get ready has closed is too late to count
	const gettingReady = state.overPause?.kind === "getReady";
	if (gettingReady ? !GET_READY_EVENTS.has(event.type) : event.type === "readyHeld") {
		return { state };
	}
	switch (event.type) {
		case "startPressed":
			return event.hasZero
				? startFlood(state, { color: event.color, at: event.at, action: play(event.color) })
				: { state: { ...state, settle: { from: "start", color: event.color } }, act: HALT_KIOSK };
		case "levelPressed":
			return {
				state: { ...state, settle: { from: event.from, color: event.color } },
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
			// The bowl stays under the flood until it has covered the screen
			const action = settle.from === "start" ? play(settle.color) : RESUME;
			return startFlood(state, { color: settle.color, at: event.at, action }, calibrate);
		}
		case "settleBacked":
			return {
				state: { ...state, settle: null },
				...(state.settle && state.settle.from !== "pause" && { act: RUN_KIOSK }),
			};
		case "speedPressed":
			return { state: { ...state, overPause: { kind: "speed", color: event.color } } };
		case "speedBacked":
			return { state: { ...state, overPause: null } };
		case "retryPressed":
			return startFlood(state, { color: event.color, at: event.at, action: play(event.color) });
		case "leavePressed":
			return startFlood(state, { color: INK_LIFT, at: event.at, action: { kind: "kiosk" } });
		case "pausePressed":
			// Get ready is over a game that is already paused; it only closes, so a hold cannot
			// complete while the player is away
			return gettingReady
				? { state: { ...state, overPause: null } }
				: { state, act: { kind: "pause" } };
		case "readyHeld":
			// The hold is the countdown; play picks up the moment the ring closes, no flood
			return { state: { ...state, overPause: null }, act: RESUME };
		case "playPressed":
			// Without tilt there is no level to hold, so nothing stands between the pause and play
			return event.tiltAvailable
				? { state: { ...state, overPause: { kind: "getReady" } } }
				: { state, act: RESUME };
		case "covered":
			return { state: { ...INITIAL_FLOW, phase: state.phase } };
	}
}
