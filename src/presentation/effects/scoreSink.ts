/**
 * Pure rules behind the paused score's sink and rise (see GLOSSARY.md): where the score stands
 * on each screen, what it does as the screen changes, and the poses the shell animates
 * between. The score is drawn once, at its middle pitch, and scaled down to the HUD's at the
 * top, so at the top it sits exactly where the HUD's meter draws its total and the meter can
 * take over without a jump. The run time has one place, under the score in the middle; it
 * pops in dot by dot after the score lands, and fades where it stands otherwise.
 */

import { layoutDotMatrix, pitchToFit } from "../dotmatrix/layout";
import type { Screen } from "../flow/screenFlow";
import { SCORE_CENTRE_Y, SCORE_PITCH } from "./scoreTally";

export type ScoreScreen = Screen["kind"];

/** Where the paused score stands: the HUD's spot at the top, or the middle of the stage */
export type ScoreSpot = "top" | "middle";

/**
 * Where the paused score stands on `screen`: the middle on the pause, the top in Get ready
 * (waiting for play), and nowhere else: in play the HUD's own meter shows it
 */
export function scoreSpot(screen: ScoreScreen): ScoreSpot | null {
	switch (screen) {
		case "pause":
			return "middle";
		case "getReady":
			return "top";
		default:
			return null;
	}
}

/**
 * What the paused score does as the screen changes: sinks from the top into the middle as
 * the pause opens from play or Get ready; rises back to the top as Get ready opens; fades in
 * or out with the pause's chrome for every other way on or off the pause; hands off to the
 * HUD's meter, at once, when Get ready resumes play; or nothing, where it is not shown
 */
export type ScoreMotion = "sink" | "rise" | "fadeIn" | "fadeOut" | "handOff" | "none";

export function scoreMotion(from: ScoreScreen | null, to: ScoreScreen): ScoreMotion {
	const was = from === null ? null : scoreSpot(from);
	const now = scoreSpot(to);
	if (now === "middle") return from === "hud" || from === "getReady" ? "sink" : "fadeIn";
	if (now === "top") return was === "middle" ? "rise" : "fadeIn";
	if (was === "top") return "handOff";
	if (was === "middle") return "fadeOut";
	return "none";
}

/** The score's dot spacing in the middle (px), and the run time's under it */
export const MIDDLE_PITCH = 10;
export const TIME_PITCH = 5;
/** Room the score keeps from the stage's sides */
const SIDE_MARGIN = 48;
/** From the score's dots' bottom row to the time's top row (px) */
export const TIME_GAP = 24;
/** The score's opacity while it waits at the top through Get ready */
export const WAIT_OPACITY = 0.45;
/** How long the sink and the rise take (ms): the frost's own time, so the two land together */
export const SINK_MS = 450;
export const RISE_MS = 450;
/** The fades with the pause's chrome (ms), as the pause overlay has them */
export const FADE_IN_MS = 300;
export const FADE_OUT_MS = 200;
/** How long the run time's dot-by-dot reveal takes (ms), once the sinking score has landed */
export const TIME_REVEAL_MS = 320;

const GLYPH_ROWS = 7;

/** The score's pitch in the middle: MIDDLE_PITCH, closer for a score too wide for the stage */
export function middlePitch(score: number, stageWidth: number): number {
	return pitchToFit(layoutDotMatrix(String(score)), stageWidth - SIDE_MARGIN, MIDDLE_PITCH);
}

/** The score's and the run time's centre lines in the middle: the pair centred on the stage */
export function middleSpot(stageHeight: number, pitch: number): { scoreY: number; timeY: number } {
	const scoreHeight = GLYPH_ROWS * pitch;
	const timeHeight = GLYPH_ROWS * TIME_PITCH;
	const top = (stageHeight - (scoreHeight + TIME_GAP + timeHeight)) / 2;
	return {
		scoreY: top + scoreHeight / 2,
		timeY: top + scoreHeight + TIME_GAP + timeHeight / 2,
	};
}

/** The score as drawn: its centre line below the stage's top, its scale from the middle pitch, its opacity */
export interface ScorePose {
	y: number;
	scale: number;
	opacity: number;
}

/** The pose at `spot`, for a score drawn at `pitch` on a stage `stageHeight` tall */
export function scorePose(spot: ScoreSpot, stageHeight: number, pitch: number): ScorePose {
	return spot === "top"
		? { y: SCORE_CENTRE_Y, scale: SCORE_PITCH / pitch, opacity: WAIT_OPACITY }
		: { y: middleSpot(stageHeight, pitch).scoreY, scale: 1, opacity: 1 };
}

/** What the run time does alongside: pops in dot by dot, or fades to `opacity` */
interface TimePlan {
	reveal: boolean;
	opacity: number;
	delayMs: number;
	ms: number;
}

/** A motion to play: the score from one pose to another over `ms`, and the time alongside */
export interface SinkPlan {
	from: ScorePose;
	to: ScorePose;
	ms: number;
	time: TimePlan;
}

/**
 * The plan for `motion`, or null where there is nothing to animate: the hand-off (the HUD's
 * meter takes over at once) and none. A sink starts at the top at full opacity, as the HUD's
 * total it carries on from was; a fade in starts where it ends, clear.
 */
export function sinkPlan(motion: ScoreMotion, stageHeight: number, pitch: number): SinkPlan | null {
	const top = scorePose("top", stageHeight, pitch);
	const middle = scorePose("middle", stageHeight, pitch);
	switch (motion) {
		case "sink":
			return {
				from: { ...top, opacity: 1 },
				to: middle,
				ms: SINK_MS,
				time: { reveal: true, opacity: 1, delayMs: SINK_MS, ms: TIME_REVEAL_MS },
			};
		case "rise":
			return {
				from: middle,
				to: top,
				ms: RISE_MS,
				time: { reveal: false, opacity: 0, delayMs: 0, ms: FADE_OUT_MS },
			};
		case "fadeIn":
			return {
				from: { ...middle, opacity: 0 },
				to: middle,
				ms: FADE_IN_MS,
				time: { reveal: false, opacity: 1, delayMs: 0, ms: FADE_IN_MS },
			};
		case "fadeOut":
			return {
				from: middle,
				to: { ...middle, opacity: 0 },
				ms: FADE_OUT_MS,
				time: { reveal: false, opacity: 0, delayMs: 0, ms: FADE_OUT_MS },
			};
		default:
			return null;
	}
}
