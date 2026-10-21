/**
 * The frost over the frozen field (see stageLook.ts): the game canvas blurs and dims the scene
 * by the frost amount, and the frost's edge is a circle around a point with one side frosted
 * and the other clear. Two steps draw that edge, in opposite directions (see GLOSSARY.md):
 * the bloom frosts the field inside the edge, growing out from under the finger that pauses
 * the run (see frostBloom.ts), and Get ready leaves the field clear inside it, the window at
 * the seat that thaws outward with the hold (see getReady.ts). Both grow from the same rest
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
 * The frost's edge: a circle in stage px, and which side of it is frosted. "outside" at radius
 * 0 is the field frosted all over; "inside" at radius 0 is a clear field.
 */
export interface FrostEdge {
	x: number;
	y: number;
	radius: number;
	frosted: "inside" | "outside";
}

/** The field frosted all over: the pause's rest state, with no window in it */
export const FROSTED_ALL: FrostEdge = { x: 0, y: 0, radius: 0, frosted: "outside" };

/**
 * What the canvas has to draw for an edge: the field frosted all over, a clear window in the
 * frost, a frosted disc on a clear field, or nothing frosted at all
 */
export type FrostShape = "all" | "window" | "disc" | "none";

export function frostShape(edge: FrostEdge): FrostShape {
	"worklet";
	if (edge.frosted === "outside") return edge.radius > 0 ? "window" : "all";
	return edge.radius > 0 ? "disc" : "none";
}

/** How dark the frosted scene is dimmed at full frost (the ink laid over it) */
export const FROST_MAX_DIM = 0.5;

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
export function frostReach(centre: Point, field: FieldSize): number {
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
 * How much of the rim is left at `progress`: all of it until the edge is well on its way to
 * the walls, then fading, so nothing is drawn over a field the edge has passed
 */
export function rimFade(progress: number): number {
	"worklet";
	return 1 - smoothstep((progress - RIM_GONE_FROM) / (1 - RIM_GONE_FROM));
}
