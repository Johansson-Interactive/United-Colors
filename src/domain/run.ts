/**
 * What a run's record says beyond its catches: the combo bonus it earned and how long it lasted.
 * Both are derived from the record, so they cannot drift from the score.
 */

import { GAME_HERTZ } from "./constants";
import type { RunRecord } from "./types";

/** The run's combo bonus: what its catches paid beyond their own value */
export function comboBonus(record: RunRecord): number {
	// A catch pays two for every catch before it in its combo
	return record.catches.reduce((sum, c) => sum + 2 * (c.step - 1), 0);
}

/** Run time in seconds (unrounded) at the engine's tick rate */
export function runSeconds(ticks: number): number {
	return ticks / GAME_HERTZ;
}
