/**
 * Pure rules behind how the field looks behind each screen (see screenFlow.ts), and how it
 * gets there. Pause and play open portals into each other (see portal.ts, ADR 0011): the play
 * side, the live field, is always drawn on top, and under it, only while the run is not in
 * play, the pause world: the frozen field, frosted, with the pause's content over it. The
 * portal decides which part of the play side shows. The bloom and Get ready move it; the look
 * only sets it to one world all over where neither is running, so the pause screen starts with
 * play hidden whatever a bloom or Get ready left, and play starts with nothing cut out of it.
 * A moment after a run ends the play side itself dims for the game over, and otherwise it
 * clears quickly. The edges are washed in ink on the title and in the player's colour
 * everywhere else. The stage fades out under the bowl and the speed view opened from the
 * title, so only their one dot moves, and back in as they close.
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
	/**
	 * Whether the pause world (the frozen field, frosted) is drawn under the pause's content,
	 * with the play side over it cut to the portal. Never in play, so play costs nothing for it.
	 */
	pauseWorld: boolean;
	/**
	 * Which world the portal is set to show all over as the screen comes on, or null where the
	 * bloom or Get ready moves it
	 */
	portal: "play" | "pause" | null;
	/**
	 * Whether the HUD's score shows: in play, and through the bloom's and Get ready's portals,
	 * which cover and uncover it with the rest of the play side
	 */
	hudScore: boolean;
	/** How frosted the play side itself is: 0 = clear; 1 = fully frosted (the game over dims it) */
	frost: StageMove<number>;
	/** The edge wash's colour */
	accent: StageAccent;
	/** 0 = the stage is hidden; 1 = it shows */
	opacity: StageMove<number>;
}

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
	const pauseWorld = pauseWorldOf(screen, phase);
	return {
		pauseWorld,
		portal: portalOf(screen, pauseWorld),
		hudScore: screen.kind === "hud" || screen.kind === "frosting" || screen.kind === "getReady",
		frost: frostOf(pauseWorld, phase),
		accent: phase === "KIOSK" ? "ink" : "player",
		opacity: opacityOf(screen, phase),
	};
}

/**
 * The pause world is under the bloom, the pause, Get ready, and the bowl and the speed view
 * opened from the pause: wherever the run is frozen and the pause is, or is opening
 */
function pauseWorldOf(screen: Screen, phase: GamePhase): boolean {
	switch (screen.kind) {
		case "frosting":
		case "pause":
		case "getReady":
			return true;
		case "settle":
		case "speed":
			return phase === "PAUSED";
		default:
			return false;
	}
}

/**
 * The bloom and Get ready move the portal themselves; over the pause world anywhere else it
 * shows the pause all over (leaving the app lands here at once, with no portal), and with no
 * pause world it shows play all over
 */
function portalOf(screen: Screen, pauseWorld: boolean): StageLook["portal"] {
	if (screen.kind === "frosting" || screen.kind === "getReady") return null;
	return pauseWorld ? "pause" : "play";
}

/**
 * Over the pause world the play side stays sharp: the frost is the pause world's, so the field
 * through Get ready's portal is the live one. The game over dims the play side itself.
 */
function frostOf(pauseWorld: boolean, phase: GamePhase): StageMove<number> {
	if (pauseWorld) return { to: 0, over: INSTANT };
	return phase === "GAME_OVER"
		? { to: GAME_OVER_FROST, over: GAME_OVER_DIM }
		: { to: 0, over: CLEAR };
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
