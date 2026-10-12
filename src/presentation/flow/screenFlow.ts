/**
 * Pure state machine behind the screens: the title, the settle bowl, the pause, the speed
 * view and the game over, and the floods between them. A flood is a dot growing from under the finger until it
 * covers the screen; the scene changes underneath, then it lifts. A first game starts by
 * setting the level pose; the settled dot then floods into play.
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
}

export const INITIAL_FLOW: FlowState = { settle: null, speed: null };

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
	/** The flood covers the screen; whatever was under it can go */
	| { type: "covered" };

/** What a flood does once it covers the screen */
export type FlowAction = { kind: "play"; color: string } | { kind: "resume" } | { kind: "kiosk" };

export interface FlowStep {
	state: FlowState;
	/** Adopt this pose as level for the side the screen faced */
	calibrate?: { zero: TiltZero; facingDown: boolean };
	/** Grow a dot of `color` from `at`; run `action` once it covers the screen */
	flood?: { color: string; at: PressPoint; action: FlowAction };
}

const play = (color: string): FlowAction => ({ kind: "play", color });

export function stepFlow(state: FlowState, event: FlowEvent): FlowStep {
	switch (event.type) {
		case "startPressed":
			return event.hasZero
				? { state, flood: { color: event.color, at: event.at, action: play(event.color) } }
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
			return { state, calibrate, flood: { color: settle.color, at: event.at, action } };
		}
		case "settleBacked":
			return { state: { ...state, settle: null } };
		case "speedPressed":
			return { state: { ...state, speed: { color: event.color } } };
		case "speedBacked":
			return { state: { ...state, speed: null } };
		case "retryPressed":
			return { state, flood: { color: event.color, at: event.at, action: play(event.color) } };
		case "leavePressed":
			return { state, flood: { color: INK_LIFT, at: event.at, action: { kind: "kiosk" } } };
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
