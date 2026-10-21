import { GAME_HERTZ } from "./constants";
import type { RunCatch, RunRecord } from "./types";

/**
 * What a catch at combo step `step` pays beyond its own value: two for every catch before it
 * in its combo (see COMBO_WINDOW_TICKS)
 */
export function comboPay(step: number): number {
	return 2 * (step - 1);
}

/** What a catch was worth on its own: what it paid less its combo bonus (see comboPay) */
export function ownValue({ value, step }: Pick<RunCatch, "value" | "step">): number {
	return value - comboPay(step);
}

/** The run's combo bonus: what its catches paid beyond their own value (see comboPay) */
export function comboBonus(record: RunRecord): number {
	let bonus = 0;
	for (const { step } of record.catches) bonus += comboPay(step);
	return bonus;
}

/** Run time in seconds (unrounded) at the engine's tick rate */
export function runSeconds(ticks: number): number {
	return ticks / GAME_HERTZ;
}

/** Run time as the glossary shows it: `M:SS`, rounded down */
export function runClock(ticks: number): string {
	const whole = Math.floor(runSeconds(ticks));
	const ss = whole % 60;
	return `${Math.floor(whole / 60)}:${ss < 10 ? "0" : ""}${ss}`;
}
