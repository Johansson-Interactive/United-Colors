import type { RenderFrame } from "../../domain/types";
import { payColor } from "../theme/theme";
import { newCatch, type TallyCatch } from "./scoreTally";

/**
 * Pure stepper between the game and the score meter: what one new frame hands the tally (see
 * scoreTally.ts). A run's catches go in from where the player took them in, in their pay
 * colour; the tally's lane freezes as the run pauses and thaws as it resumes; and a new run
 * (its score below the last frame's) or the title starts the tally over.
 */

export interface TallyFeed {
	/** Start the tally over at this score, before anything else (null: carry on) */
	reset: number | null;
	/** The frame's catches, in order */
	catches: TallyCatch[];
	/** Freeze (true) or thaw (false) the tally's lane, after the catches (null: as it is) */
	freeze: boolean | null;
}

const IN_PLAY = new Set<RenderFrame["phase"]>(["RUNNING", "REJECTING"]);

/** What `frame`, following `previous`, hands the tally */
export function feedTally(previous: RenderFrame, frame: RenderFrame): TallyFeed {
	const newRun =
		frame.score < previous.score || (frame.phase === "KIOSK" && previous.phase !== "KIOSK");
	const paused = frame.phase === "PAUSED";
	const freeze = paused !== (previous.phase === "PAUSED") ? paused : null;
	return { reset: newRun ? frame.score : null, catches: catchesOf(frame), freeze };
}

/** A run's catches in `frame`, each from where the player was as it scored */
function catchesOf(frame: RenderFrame): TallyCatch[] {
	if (!IN_PLAY.has(frame.phase)) return [];
	const player = frame.dots.find((d) => d.kind === "player");
	if (!player) return [];
	const catches: TallyCatch[] = [];
	for (const event of frame.events) {
		if (event.type !== "collect" && event.type !== "collectPoint") continue;
		const color = payColor(event.step, player.color);
		catches.push(newCatch(event.value, color, player.x, player.y));
	}
	return catches;
}
