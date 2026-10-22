/**
 * The pause hint: a caption at the foot of the field, early in a run, saying the field itself is
 * the pause (see FieldTouch), since there is no button to find. It shows over the HUD for the
 * first few seconds of run time and then goes for good; a run resumed after that never brings
 * it back, and only a run started afresh does.
 *
 * Its pair, the resume hint, stands under PAUSED for the whole pause: the frost is the way
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
