/**
 * Pure state machine behind the bloom (see GLOSSARY.md): a finger held on the field in play
 * freezes the run at once and opens a portal into the pause from under the finger. It grows
 * from the fingertip, wears the rim and grows with the hold; once it has passed the walls the
 * pause screen opens (covered). A finger lifted before then drains the portal back into the
 * fingertip, faster than it grew, and play goes on from the frozen frame (cleared). A finger
 * landing again while it drains commits to the pause: the portal grows again from where it is
 * and plays out to the walls, held or not (ADR 0015). The bloom
 * is Get ready's portal run the other way (see getReady.ts): the same ease, rim and fade, with
 * the pause inside the portal instead of the play. The dev pause dot has no finger to open
 * under, so its bloom opens at the seat instead, at the rest size around the player dot.
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
import type { FieldTouchState } from "./fieldTouch";

export interface BloomState {
	/** How far the portal has grown from the rest size towards the walls, 0..1; the field is covered at 1 */
	progress: number;
	/** Where the finger is in the bloom's hold */
	hold: BloomHold;
	/** What the bloom came to, once it has: the field covered, or the portal drained into the dot */
	outcome: BloomEnd | null;
}

/**
 * The bloom's hold: held from the start, lifted early so the portal drains, or committed by a
 * finger landing again during the drain, after which it plays out to the pause, held or not
 */
type BloomHold = "held" | "lifted" | "committed";

/** How the bloom ends: the field covered, so the pause opens, or the portal drained, so play goes on */
export type BloomEnd = "covered" | "cleared";

export const OPEN_BLOOM: BloomState = { progress: 0, hold: "held", outcome: null };

/**
 * How long the bloom must be held for the portal to pass the walls: as long as Get ready's
 * portal takes to widen to them
 */
export const BLOOM_MS = EDGE_GROW_MS;

/**
 * How soon after an early lift a finger landing again opens the pause whole: through the
 * frozen drain and on into play (ADR 0015). Open to tuning on a device.
 */
export const SECOND_TOUCH_MS = 1000;

/**
 * What started the bloom: a finger on the field, whose hold it follows; a second touch, a finger
 * landing again soon after an early lift, which commits to the pause; or the dev-only pause dot.
 * Neither of the last two is held by a finger, so their blooms play out to the pause on their own.
 */
export type BloomStart = "finger" | "secondTouch" | "pauseDot";

/** Whether the bloom started by `start` is held this frame, with whether a finger is on the field */
export function bloomHeld(start: BloomStart, fingerDown: boolean): boolean {
	"worklet";
	return start !== "finger" || fingerDown;
}

/**
 * Where the bloom started by `start` opens, and around what size of dot: a finger's, a second
 * touch's too, under the fingertip, from nothing, where `touch` says it landed; the pause dot's
 * at `seat`, where the player dot froze, at the rest size around it
 */
export function bloomOrigin(start: BloomStart, touch: FieldTouchState, seat: Disc): Disc {
	"worklet";
	return start === "pauseDot" ? seat : { x: touch.x, y: touch.y, radius: 0 };
}

/** The hold after a frame with the finger down or not: once lifted, landing again commits it */
function nextHold(hold: BloomHold, down: boolean): BloomHold {
	"worklet";
	if (hold === "committed") return hold;
	if (hold === "lifted") return down ? "committed" : hold;
	return down ? hold : "lifted";
}

/**
 * Advance one frame, with whether the bloom is still held; a lifted finger drains it faster than
 * it grew, and one landing again grows it on to the pause whatever it does next
 */
export function stepBloom(state: BloomState, held: boolean, dt: number): BloomState {
	"worklet";
	if (state.outcome !== null) return state;
	const hold = nextHold(state.hold, held);
	const growing = hold !== "lifted";
	const progress = advanceEdge(state.progress, growing, dt);
	if (progress === 1) return { progress: 1, hold, outcome: "covered" };
	if (!growing && progress === 0) return { progress: 0, hold, outcome: "cleared" };
	return { progress, hold, outcome: null };
}

/** What the bloom draws this frame */
export interface BloomFrame {
	/** The portal, the pause inside it; a zero radius is a clear field */
	portal: Portal;
	/** How strongly the rim on the edge shows, 0..1 */
	rim: number;
}

/**
 * What `state` draws around `origin` (see bloomOrigin): the portal grows from the rest size
 * around a dot of the origin's radius (none, under a finger) to the field's farthest corner from
 * it, and the rim fades as it passes the walls. Drained, the field is clear again.
 */
export function bloomFrame(state: BloomState, origin: Disc, field: FieldSize): BloomFrame {
	"worklet";
	const cleared = state.outcome === "cleared";
	const radius = cleared
		? 0
		: edgeRadius(state.progress, restRadius(origin.radius), portalReach(origin, field));
	return {
		portal: { x: origin.x, y: origin.y, radius, inside: "pause" },
		rim: cleared ? 0 : RIM * rimFade(state.progress),
	};
}

/** The bloom as it opens at `origin`: the portal at its rest size there */
export function openBloom(
	origin: Disc,
	field: FieldSize,
): PortalStep<BloomState, BloomFrame, BloomEnd> {
	"worklet";
	return { state: OPEN_BLOOM, frame: bloomFrame(OPEN_BLOOM, origin, field), end: null };
}

/** One frame of the bloom at `origin`, as the overlay runs it: inert, with the same state, once it has ended */
export function advanceBloom(
	state: BloomState,
	held: boolean,
	dt: number,
	origin: Disc,
	field: FieldSize,
): PortalStep<BloomState, BloomFrame, BloomEnd> {
	"worklet";
	const next = stepBloom(state, held, dt);
	const end = next !== state && next.outcome !== null ? next.outcome : null;
	return { state: next, frame: bloomFrame(next, origin, field), end };
}
