/**
 * Pure state machine behind Get ready: the step between the pause and play, held open by the
 * finger on the pause. A portal into play opens at the seat, where the player dot froze: the
 * cup, grown from nothing with the hold at the bloom's pace to the size of the title's bowl,
 * which a solid copy of the dot rolls around inside with the tilt from the finger's landing and
 * cannot leave: the glass holds it in as the cup grows, and herds it home as the cup drains. The
 * cup being fully open is the arming: until then the level hold doesn't count, so the jolt of
 * the finger landing can't start play. The cup leans to match the hand (see lean.ts), so the
 * dot rolls when the grip changes and glides home once it is steady, whatever the grip
 * (ADR 0016). Holding it home widens the portal to the walls, and play
 * resumes the instant the whole field is clear, from that grip as the new level pose. A finger
 * lifted before the field is clear drains the portal back into the seat, faster than it grew,
 * and Get ready is over: back to the pause.
 *
 * The hold (stepGetReady) is the rule; the cup, the roll and the rim are what shows it.
 * advanceGetReady puts them together into one step a frame, which is all the overlay runs.
 */

import type { Disc } from "../../application/sceneRecord";
import { PLAYER_NECK, PLAYER_PRESS, pressedRadius } from "../../application/wall";
import { GAME_HERTZ, POINT_DOT_PULSE_SPEED } from "../../domain/constants";
import {
	advanceEdge,
	clamp,
	EDGE_GROW_MS,
	edgeProgress,
	edgeRadius,
	type FieldSize,
	type Point,
	type Portal,
	type PortalStep,
	portalReach,
	RIM,
	restRadius,
	rimFade,
} from "../effects/portal";
import { BOWL_SIZE } from "../theme/theme";
import { followLean, type Lean } from "./lean";

export interface GetReadyState {
	/** Hold progress 0..1; the field is clear and play resumes at 1 */
	progress: number;
	fired: boolean;
}

/** Tilt (radians, either axis) that still counts as level */
const LEVEL_RAD = 0.11;

/**
 * How long the device must stay level: the portal widens at the bloom's pace, and a broken hold
 * drains faster than it fills, as the bloom does
 */
export const HOLD_MS = EDGE_GROW_MS;

export const INITIAL_GET_READY: GetReadyState = { progress: 0, fired: false };

function isLevel(x: number, y: number): boolean {
	"worklet";
	return Math.abs(x) < LEVEL_RAD && Math.abs(y) < LEVEL_RAD;
}

/**
 * Advance one frame with the latest tilt (radians, relative to the level pose). The hold grows
 * only while it is `armed` (the finger down and the cup fully open) and the phone is level;
 * otherwise it drains.
 */
export function stepGetReady(
	state: GetReadyState,
	x: number,
	y: number,
	dt: number,
	armed: boolean,
): GetReadyState {
	"worklet";
	if (state.fired) return state;
	const progress = advanceEdge(state.progress, armed && isLevel(x, y), dt);
	return { progress, fired: progress === 1 };
}

// ---- The cup, and the roll: a solid copy of the player dot that the tilt pushes around it ----

/** The cup is the title's bowl: the same size, so the dot rolls in it the same way */
export const CUP_RADIUS = BOWL_SIZE / 2;
/** Room the rolling dot keeps from the cup's rim, as the bowl's dot does */
const CUP_MARGIN = 6;

/** How far the rolling dot's centre can get from the seat in the cup `opened` 0..1 of its size */
function cupTravel(seat: Disc, opened: number): number {
	"worklet";
	return Math.max(0, CUP_RADIUS * opened - seat.radius - CUP_MARGIN);
}

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
 * moves, kept inside the cup as open as it is (`opened`, 0..1 of its size) so it rolls round its
 * rim rather than leaving it, and kept inside
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
export function rollTarget(
	seat: Disc,
	tilt: Point,
	sensitivity: number,
	field: FieldSize,
	opened = 1,
): Point {
	"worklet";
	const gain = ROLL_GAIN * sensitivity;
	const { radius } = seat;
	const { width, height, cornerExtent } = field;
	// Inside the cup first: the push is cut to the cup's travel, keeping its direction
	const travel = cupTravel(seat, opened);
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

/**
 * The rolling dot kept inside the cup `opened` 0..1 of its size: the glass stops it at the rim,
 * taking the speed that carried it there, and pushes it in as the cup drains, so it never shows
 * cut off at the portal's edge
 */
export function holdInCup(roll: Roll, seat: Disc, opened: number): Roll {
	"worklet";
	const travel = cupTravel(seat, opened);
	const dx = roll.x - seat.x;
	const dy = roll.y - seat.y;
	const distance = Math.hypot(dx, dy);
	if (distance <= travel) return roll;
	if (distance < 1e-9) return { x: seat.x, y: seat.y, vx: 0, vy: 0 };
	const nx = dx / distance;
	const ny = dy / distance;
	const out = Math.max(0, roll.vx * nx + roll.vy * ny);
	return {
		x: seat.x + nx * travel,
		y: seat.y + ny * travel,
		vx: roll.vx - out * nx,
		vy: roll.vy - out * ny,
	};
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
	const reach = seat.radius * HOME_REACH;
	return distance < reach ? 1 - distance / reach : 0;
}

// ---- The portal into play: the cup at rest, widening with the hold, and the rim that marks it ----

/** How much the cup breathes at the top of a pulse, as a fraction of the cup's size */
const BREATH = 0.03;
/** A pulse's period: the point dot's own rhythm, a shrink and a grow at the game's rate */
export const PULSE_MS = (2 * POINT_DOT_PULSE_SPEED * 1000) / GAME_HERTZ;

/**
 * How far along the bloom's growth from `seat` (0..1) the cup is fully open. The cup grows from
 * nothing at the bloom's pace: as the bloom from this seat grows past its rest, so the cup grows
 * from the seat, until it is the cup's size.
 */
function cupOpenAt(seat: Disc, field: FieldSize): number {
	"worklet";
	const rest = restRadius(seat.radius);
	return edgeProgress(rest + CUP_RADIUS, rest, portalReach(seat, field));
}

/** How open the cup is at `opening` along the bloom's growth, 0..1 of the cup's size */
function cupOpened(opening: number, seat: Disc, field: FieldSize): number {
	"worklet";
	if (opening >= cupOpenAt(seat, field)) return 1;
	const rest = restRadius(seat.radius);
	return (edgeRadius(opening, rest, portalReach(seat, field)) - rest) / CUP_RADIUS;
}

/**
 * The beat of the seat's pulse at `openMs` since the cup was fully open, 0..1 and back each
 * PULSE_MS, so it reads as the point dot's "come here"
 */
export function seatPulse(openMs: number): number {
	"worklet";
	return 0.5 - 0.5 * Math.cos((2 * Math.PI * openMs) / PULSE_MS);
}

/**
 * The portal's radius: the cup at rest, breathing by `breath` (0..1, see seatPulse and
 * seated), and widening with the hold to `reach` at full progress, where the whole
 * field is clear whatever the breath
 */
export function portalRadius(progress: number, reach: number, breath: number): number {
	"worklet";
	return edgeRadius(progress, CUP_RADIUS * (1 + BREATH * clamp(breath, 0, 1)), reach);
}

/**
 * How strongly the rim on the open cup's edge shows: beating with `pulse` while the dot is away,
 * steady at the bloom's strength once `seated`, and fading out as the portal passes the walls so
 * nothing is left drawn over a clear field
 */
export function rimOpacity(progress: number, seated: number, pulse: number): number {
	"worklet";
	const away = (0.35 + 0.5 * pulse) * (1 - seated);
	const home = RIM * seated;
	return (away + home) * rimFade(progress);
}

/**
 * The rim on the cup's edge: the bloom's, steady and in full, from the cup's first opening and
 * as it drains, and the pulse (see rimOpacity) only once it is fully open; none once shut. The
 * rim's beat starts at its top as the cup opens, so where the dot has already rolled off the
 * seat it takes over from the opening's full rim with no jump; the cup's breath, which starts
 * from rest, keeps the pulse's own phase.
 */
function cupRim(progress: number, seated: number, pulse: number, opened: number): number {
	"worklet";
	if (opened >= 1) return rimOpacity(progress, seated, 1 - pulse);
	return opened > 0 ? RIM * rimFade(progress) : 0;
}

// ---- The frame: one step of all of the above, as the overlay runs it each frame ----

/** The tilt the cup reads before its first frame: none */
const LEVEL: Point = { x: 0, y: 0 };

/** Everything Get ready carries from one frame to the next */
export interface GetReadyFrameState {
	hold: GetReadyState;
	/** The cup leaning to the hand (see lean.ts); null until the first frame */
	lean: Lean | null;
	/** The rolling dot */
	roll: Roll;
	/**
	 * How far along the bloom's growth the cup's opening is, 0..1: growing while the finger is
	 * down until the cup is fully open, draining back along the same way once it has lifted
	 */
	opening: number;
	/** Time the cup has been fully open, the clock of the rim's pulse */
	openMs: number;
	/** The cup has shut after the finger lifted: Get ready is over, back to the pause */
	shut: boolean;
}

/** How Get ready ends: the portal clear of the walls, so play resumes, or the cup shut, back to the pause */
export type GetReadyEnd = "ready" | "shut";

/** This frame's inputs: where the seat is, whether the finger is down, the tilt and the time since the last frame */
export interface GetReadyInputs {
	/** The dot at rest: where the player dot froze, at its radius (see seatOf) */
	seat: Disc;
	/** Whether the finger that opened Get ready is still on the field */
	held: boolean;
	/** Radians, relative to the level pose; the cup reads it from its own "down" (see lean) */
	tilt: Point;
	dt: number;
	field: FieldSize;
	sensitivity: number;
}

/** What Get ready draws this frame */
export interface GetReadyFrame {
	/** The rolling dot's centre */
	dot: Point;
	/** The tilt as the cup reads it, from its own "down" (see lean.ts): it rolls the dot */
	tilt: Point;
	/** The rolling dot as drawn, pressed into a wall the way the player is in play (see rollBody) */
	body: RollBody;
	/** The portal into play, the cup at rest */
	portal: Portal;
	/** How strongly the rim on the portal's edge shows, 0..1 */
	rim: number;
	/** How open the cup is, 0..1 of its size: the portal grows by it, and drains with it */
	opened: number;
	/**
	 * How strongly the bowl's glass shows at the portal's edge, 0..1: in full from the cup's
	 * first opening, so it shows at the edge as the cup grows, and fading as the rim does as the
	 * portal passes the walls
	 */
	glass: number;
}

/** One frame's step of Get ready (see advanceGetReady) */
export type GetReadyStep = PortalStep<GetReadyFrameState, GetReadyFrame, GetReadyEnd>;

/**
 * What a state draws at the seat. The portal breathes by the state's roll, which is this
 * frame's stepped roll, the same one the dot and the rim are drawn from, so the portal, its rim
 * and the dot agree on how far from home the dot is.
 */
function drawFrame(state: GetReadyFrameState, seat: Disc, field: FieldSize): GetReadyFrame {
	"worklet";
	const { hold, lean, roll, opening, openMs } = state;
	const dot = { x: roll.x, y: roll.y };
	const home = seated(roll, seat);
	const pulse = seatPulse(openMs);
	const opened = cupOpened(opening, seat, field);
	return {
		dot,
		tilt: lean?.tilt ?? LEVEL,
		body: rollBody(dot, seat.radius, field),
		portal: {
			x: seat.x,
			y: seat.y,
			radius: portalRadius(hold.progress, portalReach(seat, field), pulse * (1 - home)) * opened,
			inside: "play",
		},
		rim: cupRim(hold.progress, home, pulse, opened),
		opened,
		glass: opened > 0 ? rimFade(hold.progress) : 0,
	};
}

/**
 * Get ready as the finger lands on the pause: the cup shut, the dot on the seat, and no hold;
 * the portal into play is of no size yet, so the first frame shows the pause as it was
 */
export function openGetReady(seat: Disc, field: FieldSize): GetReadyStep {
	"worklet";
	const state: GetReadyFrameState = {
		hold: INITIAL_GET_READY,
		lean: null,
		roll: rollAt(seat),
		opening: 0,
		openMs: 0,
		shut: false,
	};
	return { state, frame: drawFrame(state, seat, field), end: null };
}

/**
 * Advance Get ready one frame: the cup's opening, then the roll, then the hold. The roll goes
 * from the first frame, inside the cup as open as it is this frame. The hold goes by whether
 * the cup was fully open as the frame began: until then it isn't armed, so the hold counts from
 * the frame after. Once fired or
 * shut it is inert: the state comes back unchanged with no end, and the frame leaves the portal
 * where it was, so the pause world can go behind an open portal unseen, and it never fires again.
 */
export function advanceGetReady(state: GetReadyFrameState, inputs: GetReadyInputs): GetReadyStep {
	"worklet";
	const { seat, held, tilt, dt, field, sensitivity } = inputs;
	if (state.hold.fired || state.shut) {
		return { state, frame: drawFrame(state, seat, field), end: null };
	}
	const openAt = cupOpenAt(seat, field);
	const wasOpen = state.opening >= openAt;
	const opening = advanceEdge(state.opening, held, dt, openAt);
	// The dot starts on the seat in whatever grip the finger landed
	const lean = followLean(state.lean, tilt, dt);
	const hold = stepGetReady(state.hold, lean.tilt.x, lean.tilt.y, dt, held && wasOpen);
	const shut = !held && opening === 0;
	const opened = cupOpened(opening, seat, field);
	const target = rollTarget(seat, lean.tilt, sensitivity, field, opened);
	const next: GetReadyFrameState = {
		hold,
		lean,
		roll: holdInCup(stepRoll(state.roll, target, dt), seat, opened),
		opening,
		openMs: wasOpen ? state.openMs + dt : state.openMs,
		shut,
	};
	const end = hold.fired ? "ready" : shut ? "shut" : null;
	return { state: next, frame: drawFrame(next, seat, field), end };
}
