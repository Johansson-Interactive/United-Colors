/**
 * Pure rules behind how the field looks behind each screen (see screenFlow.ts), and how it
 * gets there. The frozen game is frosted for the whole of the pause and everything that opens
 * over it, Get ready included, where the seat is the one clear window in the frost until the
 * hold thaws it (see getReady.ts). The bloom that pauses a run frosts in full from the first
 * frame: its edge, not the frost's strength, is what grows (see frostBloom.ts). A moment after
 * a run ends the field dims for the game over, and otherwise it clears quickly. The edges are
 * washed in ink on the title and in the player's colour everywhere else. The stage fades out
 * under the bowl and the speed view opened from the title, so only their one dot moves, and
 * back in as they close.
 *
 * The frost edge is the bloom's and Get ready's to move; the look only resets it to frosted
 * all over as the pause's or the game over's frost comes on, so neither starts with a window
 * left by a Get ready that resumed the run, or the clear edge of a bloom that drained.
 */

import type { GamePhase } from "../../domain/types";
import type { Screen } from "../flow/screenFlow";

/**
 * Where the flow is: the screen it shows, over the game's phase (the bowl and the speed view
 * are over the title or the pause)
 */
export interface StagePlace {
	screen: Screen;
	phase: GamePhase;
}

/**
 * What the edges are washed in, at once: ink, or the player's colour, which the shell follows
 * as it changes, so a catch that switches it never goes through React
 */
type StageAccent = "ink" | "player";

/** How a value gets to its target: at once, or over `duration` ms, after `delay` ms if given */
type StageTransition = { kind: "instant" } | { kind: "timed"; duration: number; delay?: number };

/** A value the stage moves to, and how */
export interface StageMove<T> {
	to: T;
	over: StageTransition;
}

/** How the field looks behind a screen */
export interface StageLook {
	/** 0 = clear; 1 = fully frosted (see frost.ts) */
	frost: StageMove<number>;
	/** Reset the frost edge to frosted all over as the pause's or the game over's frost comes on */
	shutWindow: boolean;
	/** The edge wash's colour */
	accent: StageAccent;
	/** 0 = the stage is hidden; 1 = it shows */
	opacity: StageMove<number>;
}

/** The field frosts over as the pause opens */
const FROST_ON: StageTransition = { kind: "timed", duration: 450 };
/** How far the field dims for the game over, and how: a moment after the run ends, slowly */
const GAME_OVER_FROST = 0.6;
const GAME_OVER_DIM: StageTransition = { kind: "timed", duration: 700, delay: 350 };
/** The field clears quickly as play starts or resumes */
const CLEAR: StageTransition = { kind: "timed", duration: 300 };
const INSTANT: StageTransition = { kind: "instant" };
/** The stage fades out as the bowl or the speed view opens over the title */
const STAGE_FADE_OUT: StageTransition = { kind: "timed", duration: 300 };
/** And back in, a little slower, as it closes to the title */
const STAGE_FADE_IN: StageTransition = { kind: "timed", duration: 400 };

export function stageLook({ screen, phase }: StagePlace): StageLook {
	const frost = frostOf(screen, phase);
	return {
		frost,
		shutWindow: frost.over === FROST_ON || frost.over === GAME_OVER_DIM,
		accent: phase === "KIOSK" ? "ink" : "player",
		opacity: opacityOf(screen, phase),
	};
}

/**
 * The bloom frosts at full strength from its first frame, inside an edge that grows from
 * under the finger; the frost coming on over time is for a pause with no bloom (leaving the
 * app), where the whole field frosts at once
 */
function frostOf(screen: Screen, phase: GamePhase): StageMove<number> {
	if (screen.kind === "frosting") return { to: 1, over: INSTANT };
	switch (phase) {
		case "PAUSED":
			return { to: 1, over: FROST_ON };
		case "GAME_OVER":
			return { to: GAME_OVER_FROST, over: GAME_OVER_DIM };
		default:
			return { to: 0, over: CLEAR };
	}
}

/**
 * Away from the title's kiosk the stage shows at once: over the pause the bowl and the speed
 * view leave the frozen, frosted game showing, and anywhere else it is already up. A run
 * started from the bowl is why it must be at once: the flow passes back through the title
 * under the bowl's flood (see screenFlow.ts), which starts the title's fade-in, and the
 * instant show as play starts overrides it, so the stage is up as the flood lifts.
 */
function opacityOf(screen: Screen, phase: GamePhase): StageMove<number> {
	if (phase !== "KIOSK") return { to: 1, over: INSTANT };
	return screen.kind === "settle" || screen.kind === "speed"
		? { to: 0, over: STAGE_FADE_OUT }
		: { to: 1, over: STAGE_FADE_IN };
}
