/**
 * Pure stepper behind the stage's bursts: what the stage shows, and where, as the game reports
 * what happened. A point-dot catch rings in the player's colour where it landed, and any catch
 * that carries a combo on, small dot or point dot, rings small in combo amber, the colour its
 * pay shows in (see payColor); what a catch paid is counted into the score at the top instead
 * (see scoreTally.ts). A catch on the same tick as the one before rings where that one did, a
 * moment later (see catchCue). A refusal, which ends the run, rings white at the player and
 * shakes the stage.
 *
 * Each step answers with the bursts to add, still to be laid out (see layOutBurst), whether
 * the stage shakes, and whether it waits on the catch stagger as a same-tick catch. Every step
 * goes through the stagger, so nothing shows before a catch still waiting. How the stage shakes
 * is SHAKE, here; the shell assigns the burst ids, runs the stagger and plays the shake.
 */

import { comboPay } from "../../domain/run";
import type { GameEvent } from "../../domain/types";
import { COMBO_AMBER, WHITE } from "../theme/theme";
import type { NewBurst } from "./burstFrames";

/** A point on the stage */
interface Spot {
	x: number;
	y: number;
}

/** Where things happen: the player's dot in the frame that carried the event */
export interface BurstPlayer extends Spot {
	color: string;
}

/** Where the last catch landed, before any has */
export const NO_CATCH_SPOT: Spot = { x: 0, y: 0 };

/** What one event does to the stage */
export interface BurstStep {
	/** Where the last catch not on the same tick as the one before landed */
	catchSpot: Spot;
	bursts: NewBurst[];
	/** Whether the stage shakes (see SHAKE) */
	shake: boolean;
	/** Whether it is a catch on the same tick as the one before, cued after it (see catchCue) */
	sameTick: boolean;
}

/** A ring's diameter before it grows: round a point-dot catch, and round the player on a refusal */
const POINT_RING_SIZE = 80;
const GAME_OVER_RING_SIZE = 90;
/** A combo ring's diameter before it grows: a small copy of the point-dot ring (see FULL_RING_SIZE) */
const COMBO_RING_SIZE = 28;

/** The stage's shake on a refusal: where it moves sideways (px), and in how long (ms) */
export const SHAKE: readonly { to: number; ms: number }[] = [
	{ to: -10, ms: 40 },
	{ to: 9, ms: 50 },
	{ to: -6, ms: 50 },
	{ to: 3, ms: 50 },
	{ to: 0, ms: 60 },
];

/** Step on one game event, from where the last catch landed, with the player as the frame has it */
export function stepBursts(catchSpot: Spot, event: GameEvent, player: BurstPlayer): BurstStep {
	const { x, y, color } = player;
	switch (event.type) {
		case "collect":
		case "collectPoint": {
			const at = event.sameTick ? catchSpot : { x, y };
			const bursts: NewBurst[] = [];
			if (event.type === "collectPoint") {
				bursts.push({ kind: "ring", ...at, color, size: POINT_RING_SIZE });
			}
			if (comboPay(event.step) > 0) {
				bursts.push({ kind: "ring", ...at, color: COMBO_AMBER, size: COMBO_RING_SIZE });
			}
			return { catchSpot: at, bursts, shake: false, sameTick: event.sameTick };
		}
		case "gameOver": {
			const ring: NewBurst = { kind: "ring", x, y, color: WHITE, size: GAME_OVER_RING_SIZE };
			return { catchSpot, bursts: [ring], shake: true, sameTick: false };
		}
		case "pointSpawn":
		case "spit":
			return { catchSpot, bursts: [], shake: false, sameTick: false };
	}
}
