/**
 * Pure state machine behind Get ready: the step between the pause and play, held open by the
 * finger that touched the frost. The field stays frosted; the cup opens in it at the seat,
 * where the player dot froze: a clear bowl the size of the title's, which a solid copy of the
 * dot rolls around inside with the tilt and cannot leave. Rolling the dot home and holding the
 * phone level thaws the frost outward from the cup, and play resumes the instant the whole
 * field is clear. Tilt is relative to the level pose, so "level" is the pose the player likes
 * to play in. The hold only counts after a short arming delay, so the jolt of the finger
 * landing can't start play. A finger lifted before the field is clear shuts the cup again, and
 * Get ready is over: back to the pause.
 *
 * The hold (stepGetReady) is the rule; the cup, the roll and the rim are what shows it.
 * advanceGetReady puts them together into one step a frame, which is all the overlay runs.
 */

import type { Disc } from "../../application/sceneRecord";
import { PLAYER_NECK, PLAYER_PRESS, pressedRadius } from "../../application/wall";
import { GAME_HERTZ, POINT_DOT_PULSE_SPEED } from "../../domain/constants";
import {
	EDGE_GROW_MS,
	edgeRadius,
	type FieldSize,
	PAUSE_ALL,
	type Point,
	type Portal,
	portalReach,
	rimFade,
	smoothstep,
} from "../effects/portal";
import { BOWL_SIZE } from "../theme/theme";

export interface GetReadyState {
	/** Hold progress 0..1; the field is clear and play resumes at 1 */
	progress: number;
	/** Time since Get ready opened */
	elapsedMs: number;
	fired: boolean;
}

/** Tilt (radians, either axis) that still counts as level */
const LEVEL_RAD = 0.11;
/** Samples this early are ignored, so the jolt of the finger landing can't count */
export const ARMING_MS = 200;
/** How long the device must stay level: the thaw grows at the bloom's pace */
export const HOLD_MS = EDGE_GROW_MS;
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

/**
 * Whether the player is holding level over the frame from `prev` to `next`: the hold grew. The
 * caption fades while this holds and comes back when the hold breaks (or hasn't armed yet).
 */
export function isHolding(prev: GetReadyState, next: GetReadyState): boolean {
	"worklet";
	return next.progress > prev.progress;
}

/**
 * Advance one frame with the latest tilt (radians, relative to the level pose). The hold grows
 * only while the finger is down (`held`) and the phone is level, and only for the part of the
 * frame past the arming delay; otherwise it drains.
 */
export function stepGetReady(
	state: GetReadyState,
	x: number,
	y: number,
	dt: number,
	held: boolean,
): GetReadyState {
	"worklet";
	if (state.fired) return state;
	const elapsedMs = state.elapsedMs + dt;
	// Only the part of this frame past the arming delay counts
	const armedMs = Math.min(dt, Math.max(0, elapsedMs - ARMING_MS));
	const raw =
		held && isLevel(x, y)
			? state.progress + armedMs / HOLD_MS
			: Math.max(0, state.progress - dt / DRAIN_MS);
	const progress = raw >= 1 - FULL_EPSILON ? 1 : raw;
	return { progress, elapsedMs, fired: progress === 1 };
}

// ---- The cup, and the roll: a solid copy of the player dot that the tilt pushes around it ----

/** The cup is the title's bowl: the same size, so the dot rolls in it the same way */
export const CUP_RADIUS = BOWL_SIZE / 2;
/** Room the rolling dot keeps from the cup's rim, as the bowl's dot does */
const CUP_MARGIN = 6;

/**
 * Pixels the tilt pushes the rolling dot per radian at the default sensitivity: a little off
 * level shows as a clear step off the seat, and the ~0.1 rad that still counts as level keeps
 * it within about a dot's radius of home
 */
const ROLL_GAIN = 150;

/** The centre of the corner's quarter circle when `at` is in a rounded corner's square; null otherwise */
function cornerCentre(at: Point, cornerExtent: number, field: FieldSize): Point | null {
	"worklet";
	const { width, height } = field;
	const inX = at.x < cornerExtent || at.x > width - cornerExtent;
	const inY = at.y < cornerExtent || at.y > height - cornerExtent;
	if (cornerExtent <= 0 || !inX || !inY) return null;
	return {
		x: at.x < cornerExtent ? cornerExtent : width - cornerExtent,
		y: at.y < cornerExtent ? cornerExtent : height - cornerExtent,
	};
}

/**
 * Where the tilt pushes the rolling dot: off the seat by the tilt, scaled like the dot itself
 * moves, kept inside the cup so it rolls round its rim rather than leaving it, and kept inside
 * the playfield too, so where the cup runs past a wall the dot slides along the wall (and round
 * a rounded corner) instead. Against a wall it presses in as the player does in play (see
 * PLAYER_PRESS), as deep as the player's deepest press, so a seat where the player froze pressed
 * into a wall is in reach; the seat itself is always in reach. `seat` is the dot at rest: where
 * the player dot froze, at its radius.
 *
 * A rounded corner is taken as a quarter circle reaching `cornerExtent` along each edge. That is
 * the circular corner exactly, and lies inside iOS's continuous corner of the same reach, so the
 * dot never presses further under the curve the stage is clipped to than it does into a wall;
 * the game's own bound (arena.ts) is not a worklet, so it can't run here on the UI thread.
 */
export function rollTarget(seat: Disc, tilt: Point, sensitivity: number, field: FieldSize): Point {
	"worklet";
	const gain = ROLL_GAIN * sensitivity;
	const { radius } = seat;
	const { width, height, cornerExtent } = field;
	// Inside the cup first: the push is cut to the cup's travel, keeping its direction
	const travel = Math.max(0, CUP_RADIUS - radius - CUP_MARGIN);
	let pushX = tilt.x * gain;
	let pushY = tilt.y * gain;
	const push = Math.hypot(pushX, pushY);
	if (push > travel) {
		pushX = (pushX / push) * travel;
		pushY = (pushY / push) * travel;
	}
	// The walls hold the dot's centre this far off them, pressed in as deep as it goes
	const core = radius * (1 - PLAYER_PRESS);
	const x = clamp(seat.x + pushX, Math.min(core, seat.x), Math.max(width - core, seat.x));
	const y = clamp(seat.y + pushY, Math.min(core, seat.y), Math.max(height - core, seat.y));
	const corner = cornerCentre({ x, y }, cornerExtent, field);
	if (corner === null) return { x, y };
	const dx = x - corner.x;
	const dy = y - corner.y;
	const distance = Math.hypot(dx, dy);
	// Room from the corner's centre, widened to the seat's own when it froze in this corner
	let room = cornerExtent - core;
	const seatCorner = cornerCentre(seat, cornerExtent, field);
	if (seatCorner !== null && seatCorner.x === corner.x && seatCorner.y === corner.y) {
		room = Math.max(room, Math.hypot(seat.x - corner.x, seat.y - corner.y));
	}
	if (room <= 0 || distance <= room) return { x, y };
	return { x: corner.x + (dx * room) / distance, y: corner.y + (dy * room) / distance };
}

/**
 * The rolling dot as it is drawn: pressed into a wall the way the player is in play (see
 * renderScene.ts), so it looks the same there. Its centre sinks into the wall, it is cut off at
 * the wall and joined to it by a wet fillet, and it is drawn larger so it keeps its area. Drawn
 * with the wall drop shader (see wallDropShader.ts), which these are the inputs of.
 */
export interface RollBody {
	x: number;
	y: number;
	/** The radius it is drawn at: larger when pressed, keeping its area (see pressedRadius) */
	radius: number;
	/** The wall it presses into: inward unit normal and offset (see SceneDot.wallX); zero for none */
	wallX: number;
	wallY: number;
	wallC: number;
	/** Width of the wet fillet joining it to the wall; 0 with no press */
	neck: number;
}

/**
 * The rolling dot at `dot` drawn as pressed into the nearest wall (a rounded corner's quarter
 * circle in a corner, see rollTarget): as deep as its centre is past its radius off the wall,
 * no deeper than the player presses. Where the roll overshoots past that, it is drawn at the
 * deepest press.
 */
export function rollBody(dot: Point, radius: number, field: FieldSize): RollBody {
	"worklet";
	const { width, height, cornerExtent } = field;
	// The nearest wall: its outward normal and the dot's distance from it
	let nx = 0;
	let ny = 0;
	let distance = radius;
	const corner = cornerCentre(dot, cornerExtent, field);
	if (corner !== null) {
		const dx = dot.x - corner.x;
		const dy = dot.y - corner.y;
		const out = Math.hypot(dx, dy);
		if (out > 1e-9 && cornerExtent - out < distance) {
			distance = cornerExtent - out;
			nx = dx / out;
			ny = dy / out;
		}
	} else {
		if (dot.x < distance) [distance, nx, ny] = [dot.x, -1, 0];
		if (width - dot.x < distance) [distance, nx, ny] = [width - dot.x, 1, 0];
		if (dot.y < distance) [distance, nx, ny] = [dot.y, 0, -1];
		if (height - dot.y < distance) [distance, nx, ny] = [height - dot.y, 0, 1];
	}
	const depth = radius - distance;
	if (radius <= 0 || depth <= 0) {
		return { x: dot.x, y: dot.y, radius, wallX: 0, wallY: 0, wallC: 0, neck: 0 };
	}
	const press = Math.min(depth, radius * PLAYER_PRESS);
	// Back out of the wall to the deepest press, should the roll have overshot it
	const x = dot.x - nx * (depth - press);
	const y = dot.y - ny * (depth - press);
	// Where the wall is, under the dot: the inward normal, and the wall's offset along it
	const footX = dot.x + nx * distance;
	const footY = dot.y + ny * distance;
	return {
		x,
		y,
		radius: pressedRadius(radius, press),
		wallX: -nx,
		wallY: -ny,
		wallC: -nx * footX - ny * footY,
		neck: (PLAYER_NECK * press) / PLAYER_PRESS,
	};
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

// ---- The window: the clear circle in the frost, the cup at rest, and the rim that marks it ----

/** How much the window breathes at the top of a pulse, as a fraction of the cup's size */
const BREATH = 0.03;
/** A pulse's period: the point dot's own rhythm, a shrink and a grow at the game's rate */
export const PULSE_MS = (2 * POINT_DOT_PULSE_SPEED * 1000) / GAME_HERTZ;
/** The cup opens at the seat in this long as the finger lands */
export const OPEN_MS = 120;
/** And shuts in this long once the finger lifts, faster than it opened */
const SHUT_MS = OPEN_MS * 0.4;

/**
 * The beat of the seat's pulse at `elapsedMs` since Get ready opened, 0..1 and back each
 * PULSE_MS, so it reads as the point dot's "come here"
 */
export function seatPulse(elapsedMs: number): number {
	"worklet";
	return 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsedMs) / PULSE_MS);
}

/**
 * The window's radius: the cup at rest, breathing by `breath` (0..1, see seatPulse and
 * seated), and thawing outward with the hold to `reach` at full progress, where the whole
 * field is clear whatever the breath
 */
export function windowRadius(progress: number, reach: number, breath: number): number {
	"worklet";
	return edgeRadius(progress, CUP_RADIUS * (1 + BREATH * clamp(breath, 0, 1)), reach);
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
	return (away + home) * rimFade(progress);
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
	/** How open the cup is, 0..1: opening as the finger lands, shutting once it has lifted */
	open: number;
	/** The cup has shut after the finger lifted: Get ready is over, back to the pause */
	shut: boolean;
}

/** Get ready as it opens, as the finger lands on the frost */
export const OPEN_GET_READY: GetReadyFrameState = {
	hold: INITIAL_GET_READY,
	roll: null,
	caption: false,
	open: 0,
	shut: false,
};

/**
 * The seat with no player in the frozen scene (it should always have one here): Get ready still
 * runs, on a seat of no size in the corner, but nothing is drawn and the window stays shut
 */
export const NO_SEAT: Disc = { x: 0, y: 0, radius: 0 };

/** This frame's inputs: where the seat is, whether the finger is down, the tilt and the time since the last frame */
export interface GetReadyInputs {
	/** The dot at rest: where the player dot froze, at its radius; null with no player */
	seat: Disc | null;
	/** Whether the finger that opened Get ready is still on the field */
	held: boolean;
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
	/** The seat the frame was drawn on: NO_SEAT without a player */
	seat: Disc;
	/** The rolling dot's centre */
	dot: Point;
	/** The rolling dot as drawn, pressed into a wall the way the player is in play (see rollBody) */
	body: RollBody;
	/** The clear window in the frost, the cup at rest: frosted all over without a player */
	window: Portal;
	/** How strongly the rim on the window's edge shows, 0..1 */
	rim: number;
	/**
	 * How open the cup is, 0..1, eased: the seat, the dot and its shade show by it
	 * as it opens, and go with it as it shuts
	 */
	opened: number;
	/** Whether the caption is up (the overlay fades it on the edges) */
	caption: boolean;
	/** True on the one frame Get ready fired on: play resumes */
	fired: boolean;
	/** True on the one frame the window shut on: the pause screen comes back */
	shut: boolean;
}

/**
 * What a state draws at the seat. The window breathes by the state's roll, which is this
 * frame's stepped roll, the same one the dot and the rim are drawn from, so the window, its rim
 * and the dot agree on how far from home the dot is. Without a player nothing is drawn and the
 * window stays shut, so nothing thaws open in the corner.
 */
function drawFrame(
	state: GetReadyFrameState & { roll: Roll },
	player: Disc | null,
	field: FieldSize,
	firedNow: boolean,
	shutNow: boolean,
): GetReadyFrame {
	"worklet";
	const { hold, roll, caption, open } = state;
	const dot = { x: roll.x, y: roll.y };
	if (player === null) {
		return {
			drawn: false,
			seat: NO_SEAT,
			dot,
			body: rollBody(dot, 0, field),
			window: PAUSE_ALL,
			rim: 0,
			opened: 0,
			caption,
			fired: firedNow,
			shut: shutNow,
		};
	}
	const home = seated(roll, player);
	const pulse = seatPulse(hold.elapsedMs);
	const opened = smoothstep(open);
	return {
		drawn: true,
		seat: player,
		dot,
		body: rollBody(dot, player.radius, field),
		window: {
			x: player.x,
			y: player.y,
			radius: windowRadius(hold.progress, portalReach(player, field), pulse * (1 - home)) * opened,
			inside: "play",
		},
		rim: rimOpacity(hold.progress, home, pulse) * opened,
		opened,
		caption,
		fired: firedNow,
		shut: shutNow,
	};
}

/**
 * Advance Get ready one frame: the cup's opening, then the roll, then the hold. Once fired or
 * shut it is inert: the state comes back unchanged and the frame leaves the window where it
 * was, so the frost can lift behind an open window unseen, and it never fires again.
 */
export function advanceGetReady(
	state: GetReadyFrameState,
	inputs: GetReadyInputs,
): { state: GetReadyFrameState; frame: GetReadyFrame } {
	"worklet";
	const { held, tilt, dt, field, sensitivity } = inputs;
	const seat = inputs.seat ?? NO_SEAT;
	const roll = state.roll ?? rollAt(seat);
	if (state.hold.fired || state.shut) {
		return { state, frame: drawFrame({ ...state, roll }, inputs.seat, field, false, false) };
	}
	const open = held
		? clamp(state.open + dt / OPEN_MS, 0, 1)
		: clamp(state.open - dt / SHUT_MS, 0, 1);
	const hold = stepGetReady(state.hold, tilt.x, tilt.y, dt, held);
	const shut = !held && open === 0;
	const next: GetReadyFrameState & { roll: Roll } = {
		hold,
		roll: stepRoll(roll, rollTarget(seat, tilt, sensitivity, field), dt),
		caption: held && !isHolding(state.hold, hold),
		open,
		shut,
	};
	return { state: next, frame: drawFrame(next, inputs.seat, field, hold.fired, shut) };
}

/**
 * The portal Get ready leaves behind when it closes, given its last state and the window
 * it had open: unchanged once fired, so the frost lifts behind the open window unseen; the field
 * frosted all over otherwise (the window shut, leaving the app), so the pause screen is frosted
 * all over.
 */
export function closeGetReady(state: GetReadyFrameState, portal: Portal): Portal {
	return state.hold.fired ? portal : PAUSE_ALL;
}
