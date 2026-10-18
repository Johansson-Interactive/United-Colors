import type { Catch, GameEvent } from "../../domain/types";
import { COMBO_AMBER } from "../theme/theme";

/**
 * The score pop for a catch: what it paid, in the player's colour, or in amber once it is the
 * second catch of a combo or later
 */
export function catchPop(event: Catch, playerColor: string): { text: string; color: string } {
	return { text: `+${event.value}`, color: event.step > 1 ? COMBO_AMBER : playerColor };
}

/**
 * The pop for a combo that ran its course: what the whole combo paid, in the combo's amber. No
 * `+`, as its catches have already added it to the score.
 */
export function comboTotalPop(event: Extract<GameEvent, { type: "comboEnd" }>): {
	text: string;
	color: string;
} {
	return { text: `${event.total}`, color: COMBO_AMBER };
}
