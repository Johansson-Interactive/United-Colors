/**
 * Pure state machine behind the bloom (see GLOSSARY.md): a finger held on the field in play
 * freezes the run at once and opens a portal into the pause at the seat, where the player dot
 * froze. It starts at the rest size around the dot, so the dot is gone on the first frame,
 * wears the rim and grows with the hold; once it has passed the walls the pause screen opens
 * (covered). A finger lifted before then drains the portal back into the dot, faster than it
 * grew, and play goes on from the frozen frame (cleared). The bloom is Get ready's portal
 * run the other way (see getReady.ts): the same rest size, ease, rim and fade, with the pause
 * inside the portal instead of the play.
 *
 * Steps run on the UI thread, one a frame, with whether the bloom is held; the overlay only
 * copies what a frame says to draw.
 */

import type { Disc } from "../../application/sceneRecord";
import {
	advanceEdge,
	EDGE_GROW_MS,
	edgeRadius,
	type FieldSize,
	type Portal,
	type PortalStep,
	portalReach,
	RIM,
	restRadius,
	rimFade,
} from "../effects/portal";

export interface BloomState {
	/** How far the portal has grown from the rest size towards the walls, 0..1; the field is covered at 1 */
	progress: number;
	/** What the bloom came to, once it has: the field covered, or the portal drained into the dot */
	outcome: BloomEnd | null;
}

/** How the bloom ends: the field covered, so the pause opens, or the portal drained, so play goes on */
export type BloomEnd = "covered" | "cleared";

export const OPEN_BLOOM: BloomState = { progress: 0, outcome: null };

/**
 * How long the bloom must be held for the portal to pass the walls: as long as Get ready's
 * portal takes to widen to them
 */
export const BLOOM_MS = EDGE_GROW_MS;

/**
 * What started the bloom: a finger on the field, whose hold it follows, or the dev-only pause
 * dot, which no finger holds, so the bloom plays out to the pause on its own
 */
export type BloomStart = "finger" | "pauseDot";

/** Whether the bloom started by `start` is held this frame, with whether a finger is on the field */
export function bloomHeld(start: BloomStart, fingerDown: boolean): boolean {
	"worklet";
	return start === "pauseDot" || fingerDown;
}

/** Advance one frame, with whether the bloom is still held; a lifted finger drains it faster than it grew */
export function stepBloom(state: BloomState, held: boolean, dt: number): BloomState {
	"worklet";
	if (state.outcome !== null) return state;
	const progress = advanceEdge(state.progress, held, dt);
	if (progress === 1) return { progress: 1, outcome: "covered" };
	if (!held && progress === 0) return { progress: 0, outcome: "cleared" };
	return { progress, outcome: null };
}

/** What the bloom draws this frame */
export interface BloomFrame {
	/** The portal, the pause inside it; a zero radius is a clear field */
	portal: Portal;
	/** How strongly the rim on the edge shows, 0..1 */
	rim: number;
}

/**
 * What `state` draws around `seat`, where the player dot froze, at its radius: the portal grows
 * from the rest size around the dot to the field's farthest corner from it, and the rim fades as
 * it passes the walls. Drained, the field is clear again and the dot shows.
 */
export function bloomFrame(state: BloomState, seat: Disc, field: FieldSize): BloomFrame {
	"worklet";
	const cleared = state.outcome === "cleared";
	const radius = cleared
		? 0
		: edgeRadius(state.progress, restRadius(seat.radius), portalReach(seat, field));
	return {
		portal: { x: seat.x, y: seat.y, radius, inside: "pause" },
		rim: cleared ? 0 : RIM * rimFade(state.progress),
	};
}

/** The bloom as it opens at `seat`: the portal at its rest size, so the dot is gone from the first frame */
export function openBloom(
	seat: Disc,
	field: FieldSize,
): PortalStep<BloomState, BloomFrame, BloomEnd> {
	"worklet";
	return { state: OPEN_BLOOM, frame: bloomFrame(OPEN_BLOOM, seat, field), end: null };
}

/** One frame of the bloom at `seat`, as the overlay runs it: inert, with the same state, once it has ended */
export function advanceBloom(
	state: BloomState,
	held: boolean,
	dt: number,
	seat: Disc,
	field: FieldSize,
): PortalStep<BloomState, BloomFrame, BloomEnd> {
	"worklet";
	const next = stepBloom(state, held, dt);
	const end = next !== state && next.outcome !== null ? next.outcome : null;
	return { state: next, frame: bloomFrame(next, seat, field), end };
}
