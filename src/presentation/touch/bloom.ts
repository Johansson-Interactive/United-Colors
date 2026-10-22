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

import {
	EDGE_GROW_MS,
	edgeRadius,
	type FieldSize,
	type Point,
	type Portal,
	portalReach,
	RIM,
	restRadius,
	rimFade,
} from "../effects/portal";

export interface BloomState {
	/** How far the portal has grown from the rest size towards the walls, 0..1; the field is covered at 1 */
	progress: number;
	/** What the bloom came to, once it has: the field covered, or the portal drained into the dot */
	outcome: "covered" | "cleared" | null;
}

export const OPEN_BLOOM: BloomState = { progress: 0, outcome: null };

/** How long the bloom must be held for the portal to pass the walls: as long as Get ready's portal takes to widen to the walls */
export const BLOOM_MS = EDGE_GROW_MS;
/** A lifted finger drains the portal faster than it grew */
const DRAIN_MS = BLOOM_MS * 0.4;
/** Progress this close to full counts as full, so frame-sized steps can't fall short by rounding */
const FULL_EPSILON = 1e-9;

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

function clamp(value: number, min: number, max: number): number {
	"worklet";
	return Math.min(max, Math.max(min, value));
}

/** Advance one frame, with whether the bloom is still held */
export function stepBloom(state: BloomState, held: boolean, dt: number): BloomState {
	"worklet";
	if (state.outcome !== null) return state;
	const progress = held
		? state.progress + dt / BLOOM_MS
		: clamp(state.progress - dt / DRAIN_MS, 0, 1);
	if (progress >= 1 - FULL_EPSILON) return { progress: 1, outcome: "covered" };
	if (!held && progress === 0) return { progress: 0, outcome: "cleared" };
	return { progress, outcome: null };
}

/** Where the player dot froze, and its radius: the portal opens around it */
export interface Seat extends Point {
	radius: number;
}

/** What the bloom draws this frame */
export interface BloomFrame {
	/** The portal, the pause inside it; a zero radius is a clear field */
	edge: Portal;
	/** How strongly the rim on the edge shows, 0..1 */
	rim: number;
}

/**
 * What `state` draws around `seat`: the portal grows from the rest size around the dot to the
 * field's farthest corner from it, and the rim fades as it passes the walls. Drained, the field
 * is clear again and the dot shows. With no player dot to open at (null), it opens from the
 * middle of the field.
 */
export function bloomFrame(state: BloomState, seat: Seat | null, field: FieldSize): BloomFrame {
	"worklet";
	const centre = seat ?? { x: field.width / 2, y: field.height / 2, radius: 0 };
	const radius =
		state.outcome === "cleared"
			? 0
			: edgeRadius(state.progress, restRadius(centre.radius), portalReach(centre, field));
	return {
		edge: { x: centre.x, y: centre.y, radius, inside: "pause" },
		rim: state.outcome === "cleared" ? 0 : RIM * rimFade(state.progress),
	};
}
