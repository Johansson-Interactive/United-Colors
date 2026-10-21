/**
 * Pure rules behind how the field looks behind each screen (see screenFlow.ts), and how it
 * gets there. The frozen game is frosted for the whole of the pause and everything that opens
 * over it, Get ready included, where the seat is the one clear window in the frost until the
 * hold thaws it (see getReady.ts). A moment after a run ends the field dims for the game over,
 * and otherwise it clears quickly. The edges are washed in ink on the title and in the
 * player's colour everywhere else. The stage fades out under the bowl and the speed view
 * opened from the title, so only their one dot moves, and back in as they close. In play it
 * shows at once: a run started from the bowl passes back through the title under its flood
 * (see screenFlow.ts), and showing at once as play starts overrides the title's fade-in, so
 * the stage is up as the flood lifts. Anywhere else it is already showing.
 *
 * The frost window is Get ready's to open and widen; the look only shuts it as the frost
 * comes on, so a pause always starts frosted all over.
 */

import type { GamePhase } from "../../domain/types";
import type { Screen } from "../flow/screenFlow";
import { INK_LIFT } from "../theme/theme";

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
type StageTransition = { kind: "instant" } | { kind: "timed"; duration: number; delay: number };

/** A value the stage moves to, and how */
export interface StageMove<T> {
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
	/** 0 = the stage is hidden; 1 = it shows */
	opacity: StageMove<number>;
}

/** The field frosts over as the pause opens */
const FROST_ON: StageTransition = { kind: "timed", duration: 450, delay: 0 };
/** How far the field dims for the game over, and how: a moment after the run ends, slowly */
const GAME_OVER_FROST = 0.6;
const GAME_OVER_DIM: StageTransition = { kind: "timed", duration: 700, delay: 350 };
/** The field clears quickly as play starts or resumes */
const CLEAR: StageTransition = { kind: "timed", duration: 300, delay: 0 };
const INSTANT: StageTransition = { kind: "instant" };
/** The stage fades out as the bowl or the speed view opens over the title */
const STAGE_FADE_OUT: StageTransition = { kind: "timed", duration: 300, delay: 0 };
/** And back in, a little slower, as it closes to the title */
const STAGE_FADE_IN: StageTransition = { kind: "timed", duration: 400, delay: 0 };

export function stageLook({ screen, phase, playerColor }: StagePlace): StageLook {
	const frost = frostOf(phase);
	return {
		frost,
		shutWindow: frost.over === FROST_ON,
		accent: { to: phase === "KIOSK" ? INK_LIFT : playerColor, over: INSTANT },
		opacity: opacityOf(screen, phase),
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

function opacityOf(screen: Screen, phase: GamePhase): StageMove<number> {
	// Over the pause the bowl and the speed view leave the frozen, frosted game showing
	if (phase !== "KIOSK") return { to: 1, over: INSTANT };
	return screen.kind === "settle" || screen.kind === "speed"
		? { to: 0, over: STAGE_FADE_OUT }
		: { to: 1, over: STAGE_FADE_IN };
}
