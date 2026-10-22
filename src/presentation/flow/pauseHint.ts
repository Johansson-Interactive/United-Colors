/**
 * The pause hint: a caption at the foot of the field, early in a run, saying the field itself is
 * the pause (see FieldTouch), since there is no button to find. It shows over the HUD for the
 * first few seconds of run time and then goes for good; a run resumed after that never brings
 * it back, and only a run started afresh does.
 *
 * Its pair, the resume hint, stands under PAUSED for the whole pause: the pause world is the way
 * back, and it takes a hold, not a tap, since lifting the finger shuts Get ready again.
 */

import { GAME_HERTZ } from "../../domain/constants";
import type { Screen } from "./screenFlow";

export const PAUSE_HINT = "touch to pause";
export const RESUME_HINT = "hold to play";
/** Run time the hint stays up for */
export const PAUSE_HINT_MS = 4000;

/**
 * Whether the hint shows: on the HUD, while the run is young, and only where a touch on the
 * field does pause (not in the dev mode where touch steers the dot)
 */
export function pauseHintShown(
	screen: Screen["kind"],
	runTicks: number,
	fieldPauses: boolean,
): boolean {
	return fieldPauses && screen === "hud" && (runTicks * 1000) / GAME_HERTZ < PAUSE_HINT_MS;
}

/**
 * Whether the dev-only pause dot shows: where touch steers the dot, so the field can't pause, and
 * only on the HUD. It goes as the bloom starts, so it never floats, uncut, over the pause world
 * growing from the seat.
 */
export function pauseDotShown(screen: Screen["kind"], fieldPauses: boolean): boolean {
	return !fieldPauses && screen === "hud";
}

/** How the hint shows: its opacity, and how long it takes to get there (ms) */
export interface PauseHintLook {
	opacity: 0 | 1;
	over: number;
}

const FADE_IN_MS = 400;
const FADE_OUT_MS = 600;

/**
 * How the hint shows (see pauseHintShown): it fades in, and fades out as the run grows old, but
 * a finger landing on the field takes it away at once, so no caption floats over the portal
 * opening at the seat. An early lift brings it back by the same rule that showed it.
 */
export function pauseHintLook(
	screen: Screen["kind"],
	runTicks: number,
	fieldPauses: boolean,
): PauseHintLook {
	if (pauseHintShown(screen, runTicks, fieldPauses)) return { opacity: 1, over: FADE_IN_MS };
	return { opacity: 0, over: screen === "frosting" ? 0 : FADE_OUT_MS };
}
