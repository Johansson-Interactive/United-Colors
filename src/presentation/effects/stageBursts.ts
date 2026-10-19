/**
 * Pure stepper behind the stage's bursts: what the stage shows, and where, as the game reports
 * what happened. A catch pops what it paid where it landed, in the player's colour on its own
 * or first in a combo and in combo amber from the second catch on; a point-dot catch rings
 * there too. A catch on the same tick as the one before pops where that one did, a moment later
 * (see catchCue). A combo's total pops where its last catch landed, larger and without a `+`,
 * as its catches have already added it to the score; a new run never ends the old run's combo.
 * A refusal, which ends the run, rings white at the player and shakes the stage.
 *
 * Each step answers with the bursts to add, still to be laid out (see burstFrames.ts), whether
 * the stage shakes, and when the bursts show. How the stage shakes is SHAKE, here; the shell
 * assigns the burst ids, runs the stagger and plays the shake.
 */

import type { GameEvent } from "../../domain/types";
import { COMBO_AMBER, WHITE } from "../theme/theme";

/** A point on the stage */
interface Spot {
	x: number;
	y: number;
}

/** Where things happen: the player's dot in the frame that carried the event */
export interface BurstPlayer extends Spot {
	color: string;
}

/** A burst to add, before it is laid out: a score pop or a combo total's pop, or a ring */
export type NewBurst =
	| (Spot & { kind: "pop" | "comboTotal"; text: string; color: string })
	| (Spot & { kind: "ring"; color: string; size: number });

/** What the stepper remembers between events */
export interface BurstMemory {
	/** Where the last catch not on the same tick as the one before landed */
	catchSpot: Spot;
}

export const INITIAL_BURST_MEMORY: BurstMemory = { catchSpot: { x: 0, y: 0 } };

/** What one event does to the stage, and what the stepper remembers after it */
export interface BurstStep {
	memory: BurstMemory;
	bursts: NewBurst[];
	/** Whether the stage shakes (see SHAKE) */
	shake: boolean;
	/**
	 * Set for a catch: its bursts wait for the catch stagger, given whether it landed on the same
	 * tick as the catch before. Null when they show at once.
	 */
	catchCue: { sameTick: boolean } | null;
}

/** A ring's diameter before it grows: round a point-dot catch, and round the player on a refusal */
const POINT_RING_SIZE = 80;
const GAME_OVER_RING_SIZE = 90;

/** The stage's shake on a refusal: where it moves sideways (px), and in how long (ms) */
export const SHAKE: readonly { to: number; ms: number }[] = [
	{ to: -10, ms: 40 },
	{ to: 9, ms: 50 },
	{ to: -6, ms: 50 },
	{ to: 3, ms: 50 },
	{ to: 0, ms: 60 },
];

/** Step on one game event, with the player as the frame that carried it has it */
export function stepBursts(memory: BurstMemory, event: GameEvent, player: BurstPlayer): BurstStep {
	const { x, y, color } = player;
	switch (event.type) {
		case "collect":
		case "collectPoint": {
			const next = event.sameTick ? memory : { catchSpot: { x, y } };
			const at = next.catchSpot;
			const bursts: NewBurst[] = [
				{
					kind: "pop",
					...at,
					text: `+${event.value}`,
					color: event.step > 1 ? COMBO_AMBER : color,
				},
			];
			if (event.type === "collectPoint") {
				bursts.push({ kind: "ring", ...at, color, size: POINT_RING_SIZE });
			}
			return { memory: next, bursts, shake: false, catchCue: { sameTick: event.sameTick } };
		}
		case "comboEnd": {
			const total: NewBurst = {
				kind: "comboTotal",
				...memory.catchSpot,
				text: `${event.total}`,
				color: COMBO_AMBER,
			};
			return { memory, bursts: [total], shake: false, catchCue: null };
		}
		case "gameOver": {
			const ring: NewBurst = { kind: "ring", x, y, color: WHITE, size: GAME_OVER_RING_SIZE };
			return { memory, bursts: [ring], shake: true, catchCue: null };
		}
		case "pointSpawn":
		case "spit":
			return { memory, bursts: [], shake: false, catchCue: null };
	}
}
