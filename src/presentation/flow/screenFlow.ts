/**
 * Pure state machine behind the screens: the title, the settle bowl, the pause, the speed
 * view and the game over, and the floods between them. A flood is a dot growing from under the finger until it
 * covers the screen; the scene changes underneath, then it lifts. A first game starts by
 * setting the level pose; the settled dot then floods into play. While a flood is on its way
 * the screen under it is already decided, so taps on that screen are ignored.
 */

import type { TiltZero } from "../../domain/types";
import type { PressPoint } from "../components/DotButton";
import { INK_LIFT } from "../theme/theme";

/** Where the settle bowl was opened from, which decides where play continues afterwards */
type SettleFrom = "start" | "pause" | "menu";

/** The settle bowl is open: where play continues afterwards, and the colour of its dot */
interface SettleRequest {
	from: SettleFrom;
	color: string;
}

/** The speed view is open over the pause, its dot in the player's colour */
interface SpeedRequest {
	color: string;
}

export interface FlowState {
	settle: SettleRequest | null;
	speed: SpeedRequest | null;
	/** A flood is growing towards covering the screen */
	flooding: boolean;
}

export const INITIAL_FLOW: FlowState = { settle: null, speed: null, flooding: false };

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
	/** The pause dot on the HUD, or the player leaving the app mid-run */
	| { type: "pausePressed" }
	/** The level ring on the pause, held level or tapped */
	| { type: "resumePressed" }
	/** The flood covers the screen; whatever was under it can go */
	| { type: "covered" };

/** What the game does: straight away, or once a flood covers the screen */
export type FlowAction =
	| { kind: "play"; color: string }
	| { kind: "pause" }
	| { kind: "resume" }
	| { kind: "kiosk" };

export interface FlowStep {
	state: FlowState;
	/** Adopt this pose as level for the side the screen faced */
	calibrate?: { zero: TiltZero; facingDown: boolean };
	/** Do this to the game now */
	act?: FlowAction;
	/** Grow a dot of `color` from `at`; run `action` once it covers the screen */
	flood?: { color: string; at: PressPoint; action: FlowAction };
}

const play = (color: string): FlowAction => ({ kind: "play", color });

/** Start a flood; the state stays as it is underneath until the flood covers the screen */
const startFlood = (
	state: FlowState,
	flood: NonNullable<FlowStep["flood"]>,
	calibrate?: FlowStep["calibrate"],
): FlowStep => ({
	state: { ...state, flooding: true },
	...(calibrate && { calibrate }),
	flood,
});

export function stepFlow(state: FlowState, event: FlowEvent): FlowStep {
	// The flood decides the next screen; nothing under it can change that
	if (state.flooding && event.type !== "covered") return { state };
	switch (event.type) {
		case "startPressed":
			return event.hasZero
				? startFlood(state, { color: event.color, at: event.at, action: play(event.color) })
				: { state: { ...state, settle: { from: "start", color: event.color } } };
		case "levelPressed":
			return { state: { ...state, settle: { from: event.from, color: event.color } } };
		case "settled": {
			const settle = state.settle;
			if (!settle) return { state };
			const calibrate = { zero: event.zero, facingDown: event.facingDown };
			// From the title the pose is only saved; the title comes straight back
			if (settle.from === "menu") return { state: { ...state, settle: null }, calibrate };
			// The bowl stays under the flood until it has covered the screen
			const action = settle.from === "start" ? play(settle.color) : { kind: "resume" as const };
			return startFlood(state, { color: settle.color, at: event.at, action }, calibrate);
		}
		case "settleBacked":
			return { state: { ...state, settle: null } };
		case "speedPressed":
			return { state: { ...state, speed: { color: event.color } } };
		case "speedBacked":
			return { state: { ...state, speed: null } };
		case "retryPressed":
			return startFlood(state, { color: event.color, at: event.at, action: play(event.color) });
		case "leavePressed":
			return startFlood(state, { color: INK_LIFT, at: event.at, action: { kind: "kiosk" } });
		case "pausePressed":
			return { state, act: { kind: "pause" } };
		case "resumePressed":
			return { state, act: { kind: "resume" } };
		case "covered":
			return { state: INITIAL_FLOW };
	}
}

/**
 * Whether the kiosk simulation stops and hides. Over the title the drifting dots would pull
 * the eye from the one dot that matters; the pause menu already holds a frozen, frosted game,
 * which stays as it is.
 */
export function kioskQuiet(state: FlowState): boolean {
	return state.settle !== null && state.settle.from !== "pause";
}
