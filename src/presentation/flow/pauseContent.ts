/**
 * The pause's content (PAUSED, the resume hint, QUIT, the corner menus, the paused score and
 * run time) is part of the pause world, not something that assembles itself after it opens:
 * it is already in place while the bloom's portal reveals it, and it stays as it is around the
 * portal back into play while a finger holds Get ready open (see GLOSSARY.md: Portal). Only on
 * the pause itself does it take a press, so a stray touch during either hold can't quit the
 * run or open a menu.
 */

import type { Screen } from "./screenFlow";

export interface PauseContent {
	/** QUIT and the corner menus take a press */
	pressable: boolean;
}

/** The pause's content on `screen`, or null where it isn't there */
export function pauseContent(screen: Screen["kind"]): PauseContent | null {
	switch (screen) {
		case "pause":
			return { pressable: true };
		case "frosting":
		case "getReady":
			return { pressable: false };
		default:
			return null;
	}
}

/**
 * Whether the content fades in as it first shows on `shownOn`, coming from the screen `from`:
 * only on the pause itself, back from the level bowl or the speed view, as those transitions
 * always have. Never through the bloom, where the portal reveals it already in place, and never
 * back from leaving the app mid-run, where the pause is simply there.
 */
export function pauseEntryFades(from: Screen["kind"] | null, shownOn: Screen["kind"]): boolean {
	return shownOn === "pause" && (from === "settle" || from === "speed");
}
