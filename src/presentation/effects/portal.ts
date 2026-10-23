/**
 * The portal between the pause and the play (see GLOSSARY.md): a circle around a point, with
 * the pause on one side of it and the play on the other. The pause world, the frozen field
 * frosted, lies under the play side, and the portal decides which part of the play side shows
 * over it while the bloom or Get ready moves it (see useStageLook). Two steps open the portal,
 * in opposite directions: the bloom puts the pause inside the circle, growing out from the seat as a finger
 * holds the run paused (see bloom.ts), and Get ready puts the play inside it, the cup
 * at the seat that widens to the walls with the hold (see getReady.ts). Both grow from the same rest
 * size through the same ease, wear the same rim and fade it at the same point, so here are
 * the pieces they share, and how both step a frame. No React, so the canvas and the steppers
 * can use it.
 */

import type { StretchedDisc } from "../../application/sceneRecord";

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

/**
 * No portal open: play all over. Where the portal starts, until the bloom or Get ready opens
 * one at the seat; anywhere else the play side isn't cut to it (see useStageLook)
 */
export const NO_PORTAL: Portal = { x: 0, y: 0, radius: 0, inside: "pause" };

/**
 * One frame's step of the bloom or Get ready: the state carried to the next frame, what to draw
 * (the portal among it), and how it ended on this very frame, if it did. A step that is over
 * answers with the same state, so there is nothing new to copy.
 */
export interface PortalStep<S, F extends { portal: Portal }, E extends string> {
	state: S;
	frame: F;
	end: E | null;
}

/**
 * How long the edge takes to grow from its rest size past the walls: the bloom's portal
 * covering the field and Get ready's widening to clear it go at the same pace
 */
export const EDGE_GROW_MS = 900;
/** Let go, the edge drains back along the way it grew, faster than it grew */
export const EDGE_DRAIN_MS = EDGE_GROW_MS * 0.4;

/**
 * The rim's strength in full: while the bloom grows and while Get ready's cup opens, so the two
 * portals wear the same rim
 */
export const RIM = 0.9;

/** The edge at rest reaches this far beyond the dot it opens around, as dot radii */
const REST_REACH = 1.7;
/** The rim is gone once the edge has grown this far: it has reached the walls */
const RIM_GONE_FROM = 0.6;
/** Progress this close to full counts as full, so frame-sized steps can't fall short by rounding */
const FULL_EPSILON = 1e-9;

export function clamp(value: number, min: number, max: number): number {
	"worklet";
	return Math.min(max, Math.max(min, value));
}

/** Ease 0..1 in and out, so what the edge does starts and ends softly */
export function smoothstep(t: number): number {
	"worklet";
	const k = clamp(t, 0, 1);
	return k * k * (3 - 2 * k);
}

/**
 * Advance an edge's progress along its growth one frame: towards `full` at the edge's pace
 * while `growing`, and back to 0 faster otherwise. The bloom's growth, Get ready's cup opening
 * and its hold widening the portal all move by it, so the two portals keep the same pace.
 */
export function advanceEdge(progress: number, growing: boolean, dt: number, full = 1): number {
	"worklet";
	if (!growing) return Math.max(0, progress - dt / EDGE_DRAIN_MS);
	const grown = progress + dt / EDGE_GROW_MS;
	return grown >= full - FULL_EPSILON ? full : grown;
}

/**
 * Where the portals open: the seat, where the player dot froze, at its radius. The frozen scene
 * always has a player here; were it to have none, they open from the middle of the field, at no
 * size.
 */
export function seatOf(player: StretchedDisc | null, field: FieldSize): StretchedDisc {
	"worklet";
	return player ?? { x: field.width / 2, y: field.height / 2, radius: 0, stretchX: 0, stretchY: 0 };
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
