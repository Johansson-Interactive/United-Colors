/**
 * The portal between the pause and the play (see GLOSSARY.md): a circle around a point, with
 * the pause on one side of it and the play on the other. The pause world, the frozen field
 * frosted, lies under the play side, and the portal decides which part of the play side shows
 * over it (see playShows, stageLook.ts). Two steps open the portal, in opposite
 * directions: the bloom puts the pause inside the circle, growing out from the seat as a finger
 * holds the run paused (see bloom.ts), and Get ready puts the play inside it, the window
 * at the seat that thaws outward with the hold (see getReady.ts). Both grow from the same rest
 * size through the same ease, wear the same rim and fade it at the same point, so here are
 * the pieces they share. No React, so the canvas and the steppers can use it.
 */

/** A tilt (radians) or a spot on the stage (px), by axis */
export interface Point {
	x: number;
	y: number;
}

/** The playfield, from its top-left corner */
export interface FieldSize {
	width: number;
	height: number;
	/** How far its rounded corners reach along each edge (see cornerExtent); 0 for square */
	cornerExtent: number;
}

/**
 * The portal: a circle in stage px, and which world is inside it. "play" at radius 0 is the
 * pause world all over; "pause" at radius 0 is play all over.
 */
export interface Portal {
	x: number;
	y: number;
	radius: number;
	inside: "pause" | "play";
}

/** The pause world all over: the pause screen, with no portal into play open */
export const PAUSE_ALL: Portal = { x: 0, y: 0, radius: 0, inside: "play" };
/** Play all over: a run in play, with no portal into the pause open */
export const PLAY_ALL: Portal = { x: 0, y: 0, radius: 0, inside: "pause" };

/**
 * Where the play side shows for a portal. The play side is always drawn on top, over the pause
 * world, and the portal only decides which part of it shows: all of it, outside the circle (the
 * bloom), inside it (Get ready) or none of it (the pause screen).
 */
export type PlayShows = "all" | "outside" | "inside" | "none";

export function playShows(portal: Portal): PlayShows {
	"worklet";
	if (portal.inside === "play") return portal.radius > 0 ? "inside" : "none";
	return portal.radius > 0 ? "outside" : "all";
}

/** How dark the frosted scene is dimmed at full frost (the ink laid over it) */
export const FROST_MAX_DIM = 0.5;

/**
 * How long the edge takes to grow from its rest size past the walls: the bloom's frost
 * covering the field and Get ready's thaw clearing it go at the same pace
 */
export const EDGE_GROW_MS = 900;
/** Let go, the edge drains back along the way it grew, faster than it grew */
export const EDGE_DRAIN_MS = EDGE_GROW_MS * 0.4;

/** The edge at rest reaches this far beyond the dot it opens around, as dot radii */
const REST_REACH = 1.7;
/** The rim is gone once the edge has grown this far: it has reached the walls */
const RIM_GONE_FROM = 0.6;

function clamp(value: number, min: number, max: number): number {
	"worklet";
	return Math.min(max, Math.max(min, value));
}

/** Ease 0..1 in and out, so what the edge does starts and ends softly */
export function smoothstep(t: number): number {
	"worklet";
	const k = clamp(t, 0, 1);
	return k * k * (3 - 2 * k);
}

/** The edge's radius at rest around a dot of `dotRadius`: a little clear of it */
export function restRadius(dotRadius: number): number {
	"worklet";
	return REST_REACH * dotRadius;
}

/** How far the edge must reach from `centre` to pass the whole field: its farthest corner */
export function portalReach(centre: Point, field: FieldSize): number {
	"worklet";
	return Math.hypot(
		Math.max(centre.x, field.width - centre.x),
		Math.max(centre.y, field.height - centre.y),
	);
}

/** The edge's radius as it grows with `progress` (0..1) from `rest` to `reach`, eased */
export function edgeRadius(progress: number, rest: number, reach: number): number {
	"worklet";
	return rest + (reach - rest) * smoothstep(progress);
}

/**
 * How far along its growth (0..1) the edge growing from `rest` to `reach` is at `radius`: the
 * way back from edgeRadius, so a step can grow at the edge's pace and stop at a radius of its own
 */
export function edgeProgress(radius: number, rest: number, reach: number): number {
	"worklet";
	if (reach <= rest) return 1;
	const eased = (radius - rest) / (reach - rest);
	if (eased <= 0) return 0;
	if (eased >= 1) return 1;
	// The inverse of smoothstep on 0..1
	return 0.5 - Math.sin(Math.asin(1 - 2 * eased) / 3);
}

/**
 * How much of the rim is left at `progress`: all of it until the edge is well on its way to
 * the walls, then fading, so nothing is drawn over a field the edge has passed
 */
export function rimFade(progress: number): number {
	"worklet";
	return 1 - smoothstep((progress - RIM_GONE_FROM) / (1 - RIM_GONE_FROM));
}
