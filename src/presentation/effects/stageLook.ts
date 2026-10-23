/**
 * Pure rules behind how the field looks behind each screen (see screenFlow.ts), and how it
 * gets there. Pause and play open portals into each other (see portal.ts, ADR 0012): the play
 * side, the live field, is always drawn on top, and under it, only while the run is not in
 * play, the pause world: the frozen field, frosted, with the pause's content over it. The
 * portal decides which part of the play side shows while the bloom or Get ready moves it; the
 * pause itself shows none of play, whatever a bloom or Get ready left, and play is cut nowhere.
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

/**
 * How much of the play side shows: all of it, with no pause world under it, so play costs
 * nothing for one; none of it, over the pause world (the frozen field, frosted, under the
 * pause's content); or what the portal leaves it, as the bloom or Get ready moves it
 */
export type PlayShows = "all" | "none" | "portal";

/** How the field looks behind a screen */
export interface StageLook {
	playShows: PlayShows;
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
	const playShows = playShowsOf(screen, phase);
	return {
		playShows,
		hudScore: screen.kind === "hud" || screen.kind === "frosting" || screen.kind === "getReady",
		frost: frostOf(playShows, phase),
		accent: phase === "KIOSK" ? "ink" : "player",
		opacity: opacityOf(screen, phase),
	};
}

/** Whether the pause world is drawn under the play side: wherever it doesn't show all over */
export function hasPauseWorld(playShows: PlayShows): boolean {
	return playShows !== "all";
}

/**
 * The bloom and Get ready show play through their portals. The pause world is under them, the
 * pause, and the bowl and the speed view opened from the pause: wherever the run is frozen and
 * the pause is, or is opening. Play shows none over it there.
 */
function playShowsOf(screen: Screen, phase: GamePhase): PlayShows {
	switch (screen.kind) {
		case "frosting":
		case "getReady":
			return "portal";
		case "pause":
			return "none";
		case "settle":
		case "speed":
			return phase === "PAUSED" ? "none" : "all";
		default:
			return "all";
	}
}

/**
 * Over the pause world the play side stays sharp: the frost is the pause world's, so the field
 * through Get ready's portal is the live one. The game over dims the play side itself.
 */
function frostOf(playShows: PlayShows, phase: GamePhase): StageMove<number> {
	if (hasPauseWorld(playShows)) return { to: 0, over: INSTANT };
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
