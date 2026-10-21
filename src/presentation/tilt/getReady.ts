/**
 * Pure state machine behind Get ready: the step between the pause and play. The field stays
 * frosted; the seat, where the player dot froze, is the one clear window in the frost, and a
 * solid copy of the dot rolls off the seat with the tilt. Rolling the dot home and holding the
 * phone level thaws the frost outward from the seat, and play resumes the instant the whole
 * field is clear. Tilt is relative to the level pose, so "level" is the pose the player likes
 * to play in. The hold only counts after a short arming delay, so the jolt of the thumb on the
 * play dot can't start play.
 *
 * The hold (stepGetReady) is the rule; the roll, the window and the rim are what shows it.
 * advanceGetReady puts them together into one step a frame, which is all the overlay runs.
 */

import type { Disc } from "../../application/sceneRecord";
import { GAME_HERTZ, POINT_DOT_PULSE_SPEED } from "../../domain/constants";
import { type FrostWindow, NO_FROST_WINDOW } from "../effects/frost";

export interface GetReadyState {
	/** Hold progress 0..1; the field is clear and play resumes at 1 */
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

/** The playfield the rolling dot must stay inside, from its top-left corner */
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

function clamp(value: number, min: number, max: number): number {
	"worklet";
	return Math.min(max, Math.max(min, value));
}

/** Ease 0..1 in and out, so what follows the hold starts and ends softly */
function smoothstep(t: number): number {
	"worklet";
	const k = clamp(t, 0, 1);
	return k * k * (3 - 2 * k);
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

// ---- The roll: a solid copy of the player dot that the tilt pushes off the seat ----

/**
 * Pixels the tilt pushes the rolling dot per radian at the default sensitivity: a little off
 * level shows as a clear step off the seat, and the ~0.1 rad that still counts as level keeps
 * it within about a dot's radius of home
 */
const ROLL_GAIN = 150;

/**
 * Where the tilt pushes the rolling dot: off the seat by the tilt, scaled like the dot itself
 * moves, and kept wholly inside the playfield so it slides along a wall (and round a rounded
 * corner) instead of leaving. `seat` is the dot at rest: where the player dot froze, at its
 * radius.
 *
 * A rounded corner is taken as a quarter circle reaching `cornerExtent` along each edge. That is
 * the circular corner exactly, and lies inside iOS's continuous corner of the same reach, so the
 * dot never goes under the curve the stage is clipped to; the game's own bound (arena.ts) is not
 * a worklet, so it can't run here on the UI thread.
 */
export function rollTarget(seat: Disc, tilt: Point, sensitivity: number, field: FieldSize): Point {
	"worklet";
	const gain = ROLL_GAIN * sensitivity;
	const { radius } = seat;
	const { width, height, cornerExtent } = field;
	const x = clamp(seat.x + tilt.x * gain, radius, width - radius);
	const y = clamp(seat.y + tilt.y * gain, radius, height - radius);
	// The centre of the corner's quarter circle, when the dot is in a corner's square
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

/** The rolling dot: where it is and how fast it is going (px, px/s) */
export interface Roll {
	x: number;
	y: number;
	vx: number;
	vy: number;
}

/**
 * The spring that carries the rolling dot to where the tilt pushes it: a little under critical
 * damping, so it arrives with some weight and a trace of overshoot, like a bead rolling, not a
 * cursor snapping
 */
const ROLL_STIFFNESS = 110;
const ROLL_DAMPING = 13;
/** A frame longer than this (a hitch) is stepped as if it were this long, so the spring stays stable */
const ROLL_MAX_FRAME_MS = 40;

/** The rolling dot at rest on the seat, as Get ready opens */
export function rollAt(seat: Disc): Roll {
	"worklet";
	return { x: seat.x, y: seat.y, vx: 0, vy: 0 };
}

/** Advance the rolling dot one frame towards `target` (see rollTarget) */
export function stepRoll(roll: Roll, target: Point, dt: number): Roll {
	"worklet";
	const s = Math.min(dt, ROLL_MAX_FRAME_MS) / 1000;
	const vx = roll.vx + (ROLL_STIFFNESS * (target.x - roll.x) - ROLL_DAMPING * roll.vx) * s;
	const vy = roll.vy + (ROLL_STIFFNESS * (target.y - roll.y) - ROLL_DAMPING * roll.vy) * s;
	return { x: roll.x + vx * s, y: roll.y + vy * s, vx, vy };
}

/** The rolling dot counts as home within this many seat radii of the seat's centre */
const HOME_REACH = 1.5;

/**
 * How seated the rolling dot is, 1 on the seat falling to 0 at HOME_REACH radii off it: the rim
 * pulses while the dot is away and holds steady once it is home
 */
export function seated(roll: Point, seat: Disc): number {
	"worklet";
	const distance = Math.hypot(roll.x - seat.x, roll.y - seat.y);
	return clamp(1 - distance / (seat.radius * HOME_REACH), 0, 1);
}

// ---- The window: the clear circle in the frost, and the rim that marks it ----

/** The window at rest reaches this far beyond the seat, as seat radii */
const SEAT_WINDOW = 1.7;
/** How much the window breathes at the top of a pulse, as a fraction of its rest size */
const BREATH = 0.12;
/** A pulse's period: the point dot's own rhythm, a shrink and a grow at the game's rate */
export const PULSE_MS = (2 * POINT_DOT_PULSE_SPEED * 1000) / GAME_HERTZ;
/** The rim is gone once the hold has progressed this far: the thaw has reached the walls */
const RIM_GONE_FROM = 0.6;

/**
 * The beat of the seat's pulse at `elapsedMs` since Get ready opened, 0..1 and back each
 * PULSE_MS, so it reads as the point dot's "come here"
 */
export function seatPulse(elapsedMs: number): number {
	"worklet";
	return 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsedMs) / PULSE_MS);
}

/** How far the window must reach from the seat to clear the whole field: its farthest corner */
export function windowReach(seat: Point, field: FieldSize): number {
	"worklet";
	return Math.hypot(
		Math.max(seat.x, field.width - seat.x),
		Math.max(seat.y, field.height - seat.y),
	);
}

/**
 * The window's radius: at rest around the seat, breathing by `breath` (0..1, see seatPulse
 * and seated), and thawing outward with the hold to `reach` at full progress, where the whole
 * field is clear whatever the breath
 */
export function windowRadius(
	progress: number,
	seatRadius: number,
	reach: number,
	breath: number,
): number {
	"worklet";
	const rest = SEAT_WINDOW * seatRadius * (1 + BREATH * clamp(breath, 0, 1));
	return rest + (reach - rest) * smoothstep(progress);
}

/**
 * How strongly the rim on the window's edge shows: beating with `pulse` while the dot is away,
 * steady once `seated`, and fading out as the thaw passes the walls so nothing is left drawn
 * over a clear field
 */
export function rimOpacity(progress: number, seated: number, pulse: number): number {
	"worklet";
	const away = (0.35 + 0.5 * pulse) * (1 - seated);
	const home = 0.75 * seated;
	return (away + home) * (1 - smoothstep((progress - RIM_GONE_FROM) / (1 - RIM_GONE_FROM)));
}

// ---- The frame: one step of all of the above, as the overlay runs it each frame ----

/** Everything Get ready carries from one frame to the next */
export interface GetReadyFrameState {
	hold: GetReadyState;
	/** The rolling dot; null until the first frame sets it on the seat */
	roll: Roll | null;
	/**
	 * Whether the caption is up: down while the hold grows, back as soon as it breaks. Kept
	 * rather than read off the last two holds, so it stays down once fired.
	 */
	caption: boolean;
}

/** Get ready as it opens */
export const OPEN_GET_READY: GetReadyFrameState = {
	hold: INITIAL_GET_READY,
	roll: null,
	caption: true,
};

/**
 * With no player in the frozen scene (it should always have one here) Get ready still runs, on
 * a seat of no size in the corner, but nothing is drawn
 */
const NO_SEAT: Disc = { x: 0, y: 0, radius: 0 };

/** This frame's inputs: where the seat is, the tilt and the time since the last frame */
export interface GetReadyInputs {
	/** The dot at rest: where the player dot froze, at its radius; null with no player */
	seat: Disc | null;
	/** Radians, relative to the level pose */
	tilt: Point;
	dt: number;
	field: FieldSize;
	sensitivity: number;
}

/** What Get ready draws and reports this frame */
export interface GetReadyFrame {
	/** Whether the seat, the rim and the dot are drawn at all: not without a player */
	drawn: boolean;
	/** The rolling dot's centre */
	dot: Point;
	/** The clear window in the frost */
	window: FrostWindow;
	/** How strongly the rim on the window's edge shows, 0..1 */
	rim: number;
	/** Whether the caption is up (the overlay fades it on the edges) */
	caption: boolean;
	/** True on the one frame Get ready fired on: play resumes */
	fired: boolean;
}

/**
 * What a state draws at the seat. The window breathes by the roll the state holds, which is
 * this frame's stepped roll, the same one the dot and the rim are drawn from, so the window,
 * its rim and the dot agree on how far from home the dot is. (The overlay once breathed the
 * window by the roll before the step, a frame behind the rim; nothing called for that.)
 */
function drawFrame(
	state: GetReadyFrameState,
	player: Disc | null,
	field: FieldSize,
	fired: boolean,
): GetReadyFrame {
	"worklet";
	const seat = player ?? NO_SEAT;
	const { hold, caption } = state;
	const roll = state.roll ?? rollAt(seat);
	const home = seated(roll, seat);
	const pulse = seatPulse(hold.elapsedMs);
	return {
		drawn: player !== null,
		dot: { x: roll.x, y: roll.y },
		window: {
			x: seat.x,
			y: seat.y,
			radius: windowRadius(
				hold.progress,
				seat.radius,
				windowReach(seat, field),
				pulse * (1 - home),
			),
		},
		rim: rimOpacity(hold.progress, home, pulse),
		caption,
		fired,
	};
}

/**
 * Advance Get ready one frame: the roll first, then the hold. Once fired it is inert: the
 * state comes back unchanged and the frame leaves the window open where it was, so the frost
 * can lift behind it unseen, and it never fires again.
 */
export function advanceGetReady(
	state: GetReadyFrameState,
	inputs: GetReadyInputs,
): { state: GetReadyFrameState; frame: GetReadyFrame } {
	"worklet";
	const { tilt, dt, field, sensitivity } = inputs;
	if (state.hold.fired) return { state, frame: drawFrame(state, inputs.seat, field, false) };
	const seat = inputs.seat ?? NO_SEAT;
	const roll = stepRoll(state.roll ?? rollAt(seat), rollTarget(seat, tilt, sensitivity, field), dt);
	const hold = stepGetReady(state.hold, tilt.x, tilt.y, dt);
	const next = { hold, roll, caption: !isHolding(state.hold, hold) };
	return { state: next, frame: drawFrame(next, inputs.seat, field, hold.fired) };
}

/**
 * The frost window Get ready leaves behind when it closes, given its last state and the window
 * it had open: unchanged once fired, so the frost lifts behind the open window unseen; shut
 * otherwise (the pause dot, leaving the app), so the pause screen is frosted all over.
 */
export function closeGetReady(state: GetReadyFrameState, frostWindow: FrostWindow): FrostWindow {
	return state.hold.fired ? frostWindow : NO_FROST_WINDOW;
}
