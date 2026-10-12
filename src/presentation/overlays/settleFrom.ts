/** Where the settle bowl was opened from, which decides where play continues afterwards */
export type SettleFrom = "start" | "pause" | "menu";

/**
 * Whether the kiosk simulation stops and hides while the bowl is open. Over the title the
 * drifting dots would pull the eye from the one dot that matters; the pause menu already
 * holds a frozen, frosted game, which stays as it is.
 */
export function quietsKiosk(from: SettleFrom): boolean {
	return from !== "pause";
}
