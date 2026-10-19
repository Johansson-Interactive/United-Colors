import { GAME_HERTZ } from "./constants";
import type { RunRecord } from "./types";

/**
 * The run's combo bonus: what its catches paid beyond their own value. Each catch pays two
 * for every catch before it in its combo (see COMBO_WINDOW_TICKS).
 */
export function comboBonus(record: RunRecord): number {
	let bonus = 0;
	for (const { step } of record.catches) bonus += 2 * (step - 1);
	return bonus;
}

/** Run time in seconds (unrounded) at the engine's tick rate */
export function runSeconds(ticks: number): number {
	return ticks / GAME_HERTZ;
}
