/**
 * Pure state machine behind Get ready: the step between the pause and play where the player
 * holds their dot's outline on the dot until the ring closes on it. Tilt is relative to the
 * level pose, so "level" is the pose the player likes to play in. The hold only counts after a
 * short arming delay, so the jolt of the thumb on the play dot can't start play.
 */

import type { Disc } from "../../application/sceneRecord";

export interface GetReadyState {
	/** Hold progress 0..1; the ring has closed on the dot at 1 */
	progress: number;
	/** Time since Get ready opened */
	elapsedMs: number;
	fired: boolean;
}

/** A tilt (radians) or a spot on the stage (px), by axis */
export interface Point {
	x: number;
	y: number;
}

/** The playfield the outline must stay inside, from its top-left corner */
export interface FieldSize {
	width: number;
	height: number;
	/** How far its rounded corners reach along each edge (see cornerExtent); 0 for square */
	cornerExtent: number;
}

/** Tilt (radians, either axis) that still counts as level */
const LEVEL_RAD = 0.11;
/** Samples this early are ignored, so the tap that opened Get ready can't count */
export const ARMING_MS = 200;
/** How long the device must stay level */
export const HOLD_MS = 900;
/** A broken hold drains faster than it fills */
const DRAIN_MS = HOLD_MS * 0.4;
/** Progress this close to full counts as full, so frame-sized steps can't fall short by rounding */
const FULL_EPSILON = 1e-9;

export const INITIAL_GET_READY: GetReadyState = { progress: 0, elapsedMs: 0, fired: false };

function isLevel(x: number, y: number): boolean {
	"worklet";
	return Math.abs(x) < LEVEL_RAD && Math.abs(y) < LEVEL_RAD;
}

/**
 * Pixels the outline moves per radian of tilt at the default sensitivity: a little off level
 * shows as a clear step off the dot, and the ~0.1 rad that still counts as level keeps the
 * outline within about a dot's radius of it
 */
const OUTLINE_GAIN = 150;

function clamp(value: number, min: number, max: number): number {
	"worklet";
	return Math.min(max, Math.max(min, value));
}

/**
 * Where the hollow outline of the player dot sits: off the dot by the tilt, scaled like the dot
 * itself moves, and kept wholly inside the playfield so it slides along a wall (and round a
 * rounded corner) instead of leaving. `outline` is the outline at rest: centred on the dot, at
 * its outer radius.
 *
 * A rounded corner is taken as a quarter circle reaching `cornerExtent` along each edge. That is
 * the circular corner exactly, and lies inside iOS's continuous corner of the same reach, so the
 * outline never goes under the curve the stage is clipped to; the game's own bound (arena.ts)
 * is not a worklet, so it can't run here on the UI thread.
 */
export function outlineCentre(
	outline: Disc,
	tilt: Point,
	sensitivity: number,
	field: FieldSize,
): Point {
	"worklet";
	const gain = OUTLINE_GAIN * sensitivity;
	const { radius } = outline;
	const { width, height, cornerExtent } = field;
	const x = clamp(outline.x + tilt.x * gain, radius, width - radius);
	const y = clamp(outline.y + tilt.y * gain, radius, height - radius);
	// The centre of the corner's quarter circle, when the outline is in a corner's square
	const cx = x < cornerExtent ? cornerExtent : x > width - cornerExtent ? width - cornerExtent : x;
	const cy =
		y < cornerExtent ? cornerExtent : y > height - cornerExtent ? height - cornerExtent : y;
	const room = cornerExtent - radius;
	const dx = x - cx;
	const dy = y - cy;
	const distance = Math.hypot(dx, dy);
	if (room <= 0 || distance <= room) return { x, y };
	return { x: cx + (dx * room) / distance, y: cy + (dy * room) / distance };
}

/**
 * The ring's radius as Get ready opens (px): well clear of a player dot, so the contraction
 * onto it is long enough to read as the countdown
 */
export const RING_START_RADIUS = 40;

/**
 * The ring around the player dot contracts with the hold, from its starting size onto the dot
 * itself at full progress, so a ring clipped by a wall shrinks back into view as the hold succeeds
 */
export function ringRadius(progress: number, dotRadius: number): number {
	"worklet";
	const start = Math.max(RING_START_RADIUS, dotRadius);
	return start + (dotRadius - start) * clamp(progress, 0, 1);
}

/**
 * Whether the player is holding level over the frame from `prev` to `next`: the hold grew. The
 * caption fades while this holds and comes back when the hold breaks (or hasn't armed yet).
 */
export function isHolding(prev: GetReadyState, next: GetReadyState): boolean {
	"worklet";
	return next.progress > prev.progress;
}

/** Advance one frame with the latest tilt (radians, relative to the level pose) */
export function stepGetReady(
	state: GetReadyState,
	x: number,
	y: number,
	dt: number,
): GetReadyState {
	"worklet";
	if (state.fired) return state;
	const elapsedMs = state.elapsedMs + dt;
	// Only the part of this frame past the arming delay counts
	const armedMs = Math.min(dt, Math.max(0, elapsedMs - ARMING_MS));
	const raw = isLevel(x, y)
		? state.progress + armedMs / HOLD_MS
		: Math.max(0, state.progress - armedMs / DRAIN_MS);
	const progress = raw >= 1 - FULL_EPSILON ? 1 : raw;
	return { progress, elapsedMs, fired: progress === 1 };
}
