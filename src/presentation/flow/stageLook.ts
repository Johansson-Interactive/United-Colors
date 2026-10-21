/**
 * Pure rules behind how the field looks behind each screen (see screenFlow.ts), and how it
 * gets there. The frozen game is frosted for the whole of the pause and everything that opens
 * over it, Get ready included, where the seat is the one clear window in the frost until the
 * hold thaws it (see getReady.ts). A moment after a run ends the field dims for the game over,
 * and otherwise it clears quickly. The edges are washed in ink on the title and in the
 * player's colour everywhere else.
 *
 * The frost window is Get ready's to open and widen; the look only shuts it as the frost
 * comes on, so a pause always starts frosted all over. The shell applies a look to the stage
 * as it changes: each value's move is one of the constants here, so an unchanged value keeps
 * the same move and is left alone.
 */

import type { GamePhase } from "../../domain/types";
import { INK_LIFT } from "../theme/theme";
import type { Screen } from "./screenFlow";

/**
 * Where the flow is: the screen it shows, over the game's phase (the bowl and the speed view
 * are over the title or the pause), and the player's colour
 */
export interface StagePlace {
	screen: Screen;
	phase: GamePhase;
	playerColor: string;
}

/** How a value gets to its target: at once, or over `duration` ms after `delay` ms */
export type StageTransition =
	| { kind: "instant" }
	| { kind: "timed"; duration: number; delay: number };

/** A value the stage moves to, and how */
interface StageMove<T> {
	to: T;
	over: StageTransition;
}

/** How the field looks behind a screen */
export interface StageLook {
	/** 0 = clear; 1 = fully frosted (see frost.ts) */
	frost: StageMove<number>;
	/** Shut the frost window as the frost comes on */
	shutWindow: boolean;
	/** The edge wash's colour */
	accent: StageMove<string>;
}

/** The field frosts over as the pause opens */
const FROST_ON: StageTransition = { kind: "timed", duration: 450, delay: 0 };
/** How far the field dims for the game over, and how: a moment after the run ends, slowly */
const GAME_OVER_FROST = 0.6;
const GAME_OVER_DIM: StageTransition = { kind: "timed", duration: 700, delay: 350 };
/** The field clears quickly as play starts or resumes */
const CLEAR: StageTransition = { kind: "timed", duration: 300, delay: 0 };
const INSTANT: StageTransition = { kind: "instant" };

export function stageLook({ phase, playerColor }: StagePlace): StageLook {
	return {
		frost: frostOf(phase),
		shutWindow: phase === "PAUSED",
		accent: { to: phase === "KIOSK" ? INK_LIFT : playerColor, over: INSTANT },
	};
}

function frostOf(phase: GamePhase): StageMove<number> {
	switch (phase) {
		case "PAUSED":
			return { to: 1, over: FROST_ON };
		case "GAME_OVER":
			return { to: GAME_OVER_FROST, over: GAME_OVER_DIM };
		default:
			return { to: 0, over: CLEAR };
	}
}
