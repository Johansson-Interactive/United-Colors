/**
 * The pause's content (PAUSED, the resume hint, QUIT, the corner menus, the paused score and
 * run time) is part of the pause world, not something that assembles itself after it opens:
 * it is already in place while the bloom's portal reveals it, and it stays as it is around the
 * portal back into play while a finger holds Get ready open (see GLOSSARY.md: Portal). Only on
 * the pause itself does it take a press, so a stray touch during either hold can't quit the
 * run or open a menu.
 */

import type { Screen } from "./screenFlow";

/** The pause's content: taking a press, or there but inert */
export type PauseContent = "pressable" | "inert";

/** The pause's content on `screen`, or null where it isn't there */
export function pauseContent(screen: Screen["kind"]): PauseContent | null {
	switch (screen) {
		case "pause":
			return "pressable";
		case "frosting":
		case "getReady":
			return "inert";
		default:
			return null;
	}
}

/**
 * Whether the content fades in as it first shows: only where it comes straight onto the pause
 * itself (back from the level bowl or the speed view, or from leaving the app mid-run), never
 * under the bloom, where it first shows inert and the portal reveals it already in place
 */
export function pauseEntryFades(content: PauseContent): boolean {
	return content === "pressable";
}
