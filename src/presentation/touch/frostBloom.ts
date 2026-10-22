/**
 * Pure state machine behind the bloom (see GLOSSARY.md): a finger held on the field in play
 * freezes the run at once and frosts the field from under the finger outward. The frost's edge
 * wears the rim and grows with the hold; once it has passed the walls the pause screen opens
 * (covered). A finger lifted before then drains the frost back into the fingertip, faster than
 * it grew, and play goes on from the frozen frame (cleared). The bloom is the Get ready window
 * run the other way (see getReady.ts): the same rest size, ease, rim and fade, frosted inside
 * the edge instead of outside.
 *
 * Steps run on the UI thread, one a frame, with whether the finger is down; the overlay only
 * copies what a frame says to draw.
 */

import {
	EDGE_GROW_MS,
	edgeRadius,
	type FieldSize,
	type FrostEdge,
	frostReach,
	type Point,
	restRadius,
	rimFade,
	smoothstep,
} from "../effects/frost";

export interface BloomState {
	/** How far the frost has grown towards the walls, 0..1; the field is covered at 1 */
	progress: number;
	/** How open the edge is at its rest size, 0..1: opening as the finger lands, shutting as it drains */
	open: number;
	/** What the bloom came to, once it has: the field covered, or the frost drained away */
	outcome: "covered" | "cleared" | null;
}

export const OPEN_BLOOM: BloomState = { progress: 0, open: 0, outcome: null };

/** How long the finger must be held for the frost to pass the walls: as long as Get ready's thaw */
export const BLOOM_MS = EDGE_GROW_MS;
/** A lifted finger drains the frost faster than it grew */
const DRAIN_MS = BLOOM_MS * 0.4;
/** The edge opens to its rest size under the finger in this long */
const OPEN_MS = 120;
/** Progress this close to full counts as full, so frame-sized steps can't fall short by rounding */
const FULL_EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
	"worklet";
	return Math.min(max, Math.max(min, value));
}

/** Advance one frame, with whether the finger is still down */
export function stepBloom(state: BloomState, held: boolean, dt: number): BloomState {
	"worklet";
	if (state.outcome !== null) return state;
	const progress = held
		? state.progress + dt / BLOOM_MS
		: clamp(state.progress - dt / DRAIN_MS, 0, 1);
	const open = held
		? clamp(state.open + dt / OPEN_MS, 0, 1)
		: clamp(state.open - dt / DRAIN_MS, 0, 1);
	if (progress >= 1 - FULL_EPSILON) return { progress: 1, open: 1, outcome: "covered" };
	if (!held && progress === 0 && open === 0) return { progress: 0, open: 0, outcome: "cleared" };
	return { progress, open, outcome: null };
}

/** What the bloom draws this frame */
export interface BloomFrame {
	/** The frost's edge, frosted inside; a zero radius is a clear field */
	edge: FrostEdge;
	/** How strongly the rim on the edge shows, 0..1 */
	rim: number;
}

/** The rim's strength while the edge is on its way to the walls */
const RIM = 0.9;

/**
 * What `state` draws, for a bloom that opened at `origin` around a dot of `dotRadius`: the edge
 * grows from the rest size around the dot to the field's far corner, scaled by how open it is,
 * and the rim fades as the edge passes the walls
 */
export function bloomFrame(
	state: BloomState,
	origin: Point,
	dotRadius: number,
	field: FieldSize,
): BloomFrame {
	"worklet";
	const grown = edgeRadius(state.progress, restRadius(dotRadius), frostReach(origin, field));
	const radius = grown * smoothstep(state.open);
	return {
		edge: { x: origin.x, y: origin.y, radius, frosted: "inside" },
		rim: RIM * rimFade(state.progress) * smoothstep(state.open),
	};
}
