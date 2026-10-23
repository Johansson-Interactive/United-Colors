/**
 * Where the paused run's score and run time stand: still, as a pair, in the middle of the
 * stage (see PausedScore). The HUD's own score stays on the play side.
 */

import { GLYPH_ROWS } from "../dotmatrix/glyphs";
import { layoutDotMatrix, pitchToFit } from "../dotmatrix/layout";

/** The score's dot spacing in the middle (px), and the run time's under it */
export const MIDDLE_PITCH = 10;
export const TIME_PITCH = 5;
/** Room the score keeps from the stage's sides */
const SIDE_MARGIN = 48;
/** From the score's dots' bottom row to the time's top row (px) */
export const TIME_GAP = 24;

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
