/**
 * How the game over draws a moment of the pour (see pourRun.ts): the pure mappings between the
 * stepper's view and what the shell puts on screen, kept here so the React shell stays thin.
 */

import { DEFAULT_DENSITY } from "../../application/GameSession";
import type { BestVerdict, GameStoreState } from "../../application/GameStore";
import {
	JELLY_AT_REST,
	type JellyBody,
	type JellyState,
	jellyAtRest,
	jellyShape,
	kickJelly,
	stepJelly,
} from "../../application/jelly";
import { MERGE_SHRINK } from "../../application/renderScene";
import { SMALL_DOT_SIZE_RATIO } from "../../domain/constants";
import type { RunRecord } from "../../domain/types";
import { LIQUID_REACH, MERGE_BLEND, MERGE_MAX_BLOBS } from "../mergeShader";
import { advanceBursts, type Burst, withBurst } from "./burstFrames";
import {
	amberLevel,
	POUR_DOT_RADIUS,
	POUR_FADE_MS,
	POUR_RISE_MS,
	type PourFlight,
	type PourInput,
	type PourPlan,
	type PourView,
	pourAt,
} from "./pourRun";

/** What the row under the drop shows: nothing, the `best N` caption, or NEW BEST! */
export type BestRow = { kind: "none" } | { kind: "best"; best: number } | { kind: "newBest" };

/**
 * The best row at a moment of the pour, once the run is judged. A run that beat the best shows
 * the best it had to beat until the tally passes it, then nothing until the drop settles into
 * NEW BEST! (and the confetti); any other run keeps the caption throughout, as it ends. The
 * best to beat is the verdict's, the one the run was judged against, as the store's best is
 * already the run's own by the time the verdict lands.
 */
export function bestRow(
	pour: { tally: number; settled: boolean },
	verdict: BestVerdict | null,
): BestRow {
	if (verdict === null) return { kind: "none" };
	if (!verdict.newBest) return { kind: "best", best: verdict.best };
	if (pour.settled) return { kind: "newBest" };
	// The tally only grows, so once past the best it stays past it
	return pour.tally <= verdict.previous
		? { kind: "best", best: verdict.previous }
		: { kind: "none" };
}

/** No catches, no time: what a game over without a run record pours */
const NO_RUN: RunRecord = { catches: [], ticks: 0 };

/** The tally's dot spacing (px), as the game over has always set the score... */
const SCORE_PITCH = 14;
/** ...and closer for a score of this many digits or more */
const LONG_SCORE_PITCH = 11;
const LONG_SCORE_DIGITS = 4;

/**
 * The pour of the game over showing now, from the store as it stands when the game over
 * appears: the frame's run, and the tally's pitch, closer for a long score
 */
export function pourInput({ frame }: Pick<GameStoreState, "frame">, color: string): PourInput {
	const long = String(frame.score).length >= LONG_SCORE_DIGITS;
	return {
		record: frame.run ?? NO_RUN,
		color,
		pitch: long ? LONG_SCORE_PITCH : SCORE_PITCH,
	};
}

/** A tally dot's radius as a fraction of the pitch, as DotMatrixText draws it */
export const POUR_DIGIT_SCALE = 0.38;

/** How the pour fits its slot: its scale, and the slot's half height (px) */
export interface PourFit {
	scale: number;
	half: number;
}

/**
 * The pour's slot between the clock and the best row: high enough for the settled drop (as
 * far as its slosh reaches) and the score's dots at `pitch`, lifted clear of the amber,
 * scaled down to fit `available` px when that is not
 */
export function pourFit(plan: PourPlan, pitch: number, available: number): PourFit {
	let extent = plan.settledDrop.radius * LIQUID_REACH;
	for (const dot of plan.digits[plan.digits.length - 1]) {
		extent = Math.max(extent, Math.abs(dot.y + plan.lift) + pitch * POUR_DIGIT_SCALE);
	}
	const scale = Math.min(1, available / (2 * extent));
	return { scale, half: extent * scale };
}

/** How long the drawn drop takes to follow the stepper's (ms): about two thirds of the way */
const EASE_MS = 70;

/** `current` eased toward `target` over a frame of `dtMs`, never past it */
export function easeToward(current: number, target: number, dtMs: number): number {
	"worklet";
	return current + (target - current) * (1 - Math.exp(-dtMs / EASE_MS));
}

/** How hard a landing knocks the drop's liquid, in drop radii per second: a point dot harder */
const KICK_SMALL = 20;
const KICK_POINT = 30;

/**
 * The velocity (px/s) a catch landing on its spot knocks the drop's mass into (see
 * kickJelly): in from the spot toward the drop's centre, so an off-centre landing pushes
 * sideways as well as down, and straight down onto a drop with no size yet
 */
export function landingKick(
	landing: { x: number; y: number; point: boolean },
	radius: number,
): { x: number; y: number } {
	"worklet";
	const speed = radius * (landing.point ? KICK_POINT : KICK_SMALL);
	const out = Math.hypot(landing.x, landing.y);
	if (out === 0) return { x: 0, y: speed };
	return { x: (-landing.x / out) * speed, y: (-landing.y / out) * speed };
}

/** The pour's clock starts this long after the game over mounts (ms), as it fades in */
export const POUR_DELAY_MS = 350;
/** Longest frame (ms) the drop's liquid integrates, so a stall does not kick it */
const MAX_FRAME_MS = 100;
/** How close (px) the drawn drop must be to the stepper's to count as there */
const EASED_PX = 0.01;

/** One frame of the pour as the canvas draws it, from the drop's centre */
export interface PourFrame {
	view: PourView;
	/** The drop's radius, eased after the stepper's */
	radius: number;
	/** The amber share, as the stepper's: it rises smoothly on its own */
	amber: number;
	jelly: JellyState;
	/** The landings' bursts, at frame time `now` (see burstFrames.ts) */
	bursts: Burst[];
	now: number;
}

/** What the game over's interface shows of the pour; it changes only now and then */
export interface PourStatus {
	clock: string;
	/** What the catches landed so far paid */
	tally: number;
	settled: boolean;
}

function statusOf(view: PourView): PourStatus {
	"worklet";
	return { clock: view.clock, tally: view.drop.tally, settled: view.settled };
}

function sameStatus(a: PourStatus, b: PourStatus): boolean {
	"worklet";
	return a.clock === b.clock && a.tally === b.tally && a.settled === b.settled;
}

/** The pour played so far, carried from frame to frame on the UI thread */
export interface PourPlayback {
	/** The frame time the pour's clock started at; null before the first frame */
	start: number | null;
	/** The replay time last sampled (ms) */
	sampled: number;
	body: JellyBody;
	frame: PourFrame;
	/** The status last reported, or the one the pour starts with */
	status: PourStatus;
	/** Settled, its amber risen, `+N` in, its liquid at rest and its bursts over: nothing left to draw */
	done: boolean;
}

/** What one frame of the pour does */
export interface PourStep {
	playback: PourPlayback;
	/** The sounds of the catches heard landing this frame */
	sounds: PourView["sounds"];
	/** The status, when it changed this frame; null when it did not */
	status: PourStatus | null;
}

/** A planned pour before its first frame */
export function startPour(plan: PourPlan): PourPlayback {
	const view = pourAt(plan, -POUR_DELAY_MS);
	return {
		start: null,
		sampled: -POUR_DELAY_MS,
		body: JELLY_AT_REST,
		frame: { view, radius: 0, amber: 0, jelly: jellyShape(JELLY_AT_REST, 0), bursts: [], now: 0 },
		status: statusOf(view),
		done: false,
	};
}

/**
 * The pour at UI frame time `now`, `dtMs` after the frame before: the stepper sampled since the
 * last frame, each landing kicking the drop's liquid down and adding its bursts, the drawn drop
 * eased toward the stepper's and the liquid stepped. Null once the pour is done, as nothing
 * changes after.
 */
export function stepPour(
	plan: PourPlan,
	playback: PourPlayback,
	now: number,
	dtMs: number,
): PourStep | null {
	"worklet";
	if (playback.done) return null;
	const start = playback.start ?? now;
	const ms = now - start - POUR_DELAY_MS;
	const dt = Math.min(MAX_FRAME_MS, dtMs);
	const view = pourAt(plan, ms, playback.sampled);
	const before = playback.frame;
	let body = playback.body;
	let bursts = before.bursts;
	for (const landing of view.landings) {
		const kick = landingKick(landing, view.drop.radius);
		body = kickJelly(body, kick.x, kick.y);
		for (const burst of landing.bursts) bursts = withBurst(bursts, burst);
	}
	body = stepJelly(body, 0, 0, view.drop.radius, dt);
	bursts = advanceBursts(bursts, now);
	const radius = easeToward(before.radius, view.drop.radius, dt);
	const { amber } = view;
	const status = statusOf(view);
	const changed = !sameStatus(status, playback.status);
	const done =
		ms >= plan.settleMs + POUR_RISE_MS + POUR_FADE_MS &&
		bursts.length === 0 &&
		jellyAtRest(body, view.drop.radius) &&
		Math.abs(radius - view.drop.radius) < EASED_PX;
	return {
		playback: {
			start,
			sampled: ms,
			body,
			frame: { view, radius, amber, jelly: jellyShape(body, view.drop.radius), bursts, now },
			status: changed ? status : playback.status,
			done,
		},
		sounds: view.sounds,
		status: changed ? status : null,
	};
}

/** What pourBody draws from: the moment's catches in flight and the drop as drawn */
export interface PourBodyInput {
	flights: readonly PourFlight[];
	/** The drop's colour */
	color: string;
	/** The drop's radius as drawn (px) */
	radius: number;
	jelly: JellyState;
	/** Where the canvas's top edge is, from the drop's centre (px, so negative) */
	top: number;
	/** The combo bonus's share of the drop, as drawn */
	amber: number;
	/** The scale the pour is drawn at, so its catches fall at their size in play on screen */
	scale: number;
}

/** A catch falls at a free small dot's radius in play (px on screen), point dots too */
const POUR_CATCH_RADIUS = (SMALL_DOT_SIZE_RATIO * DEFAULT_DENSITY) / 2;

/** A catch drawn on its own, as a glass bead, outside the liquid body */
interface PourBead {
	x: number;
	y: number;
	radius: number;
	color: string;
}

/**
 * The drop and the catches merging into it as one liquid body under the merge shader (see
 * mergeShader.ts), in coordinates from the drop's centre: the shader's values (its colour
 * aside), the rect to fill, and where its amber layer starts, down to the rect's bottom
 */
export interface PourBody {
	values: number[];
	x: number;
	y: number;
	width: number;
	height: number;
	amberY: number;
	/** Catches of another colour than the drop, which fall on their own until they land */
	beads: PourBead[];
}

/**
 * The pour at one moment as the merge shader draws it, the way a caught dot merges into the
 * player in play: each catch falls as a small dot, straight down from out of sight above the
 * canvas, speeding up, onto its spot on the drop's top, then slides into its centre, shrinking
 * as it goes. A catch of another colour (a point dot, before it recolours the drop) is a bead
 * of its own.
 */
export function pourBody({
	flights,
	color,
	radius,
	jelly,
	top,
	amber,
	scale,
}: PourBodyInput): PourBody {
	"worklet";
	// The drop is the first body, its liquid; before the first catch lands there is none, and
	// that catch is the first body until it does
	const blobs: number[] = radius > 0 ? [0, 0, radius] : [];
	const beads: PourBead[] = [];
	const reach = radius * LIQUID_REACH;
	let side = reach;
	let highest = -reach;
	const r = POUR_CATCH_RADIUS / scale;
	for (const f of flights) {
		// It comes to rest touching the drop at its spot, out along the line through it from
		// the drop's centre (straight above it on a drop with no size yet)
		const out = Math.hypot(f.x, f.y);
		const landedX = out > 0 ? (f.x / out) * (radius + r) : 0;
		const landedY = out > 0 ? (f.y / out) * (radius + r) : -(radius + r);
		const from = top - r;
		const slide = f.merge * f.merge;
		const x = landedX * (1 - slide);
		const y = f.merge > 0 ? landedY * (1 - slide) : from + (landedY - from) * f.fall * f.fall;
		const shrunk = r * (1 - (1 - MERGE_SHRINK) * slide);
		if (f.color !== color) {
			beads.push({ x, y, radius: shrunk, color: f.color });
			continue;
		}
		blobs.push(x, y, shrunk);
		side = Math.max(side, Math.abs(x) + shrunk);
		highest = Math.min(highest, y - shrunk);
	}
	const count = blobs.length / 3;
	while (blobs.length < MERGE_MAX_BLOBS * 3) blobs.push(0, 0, 0);
	const blend = Math.max(radius, POUR_DOT_RADIUS) * MERGE_BLEND;
	// No dent, no walls and no neck: the drop hangs free
	blobs.push(count, blend, jelly.stretchX, jelly.stretchY, jelly.wobble);
	blobs.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
	// The smooth-min can bulge the surface out by up to blend / 4 beyond either circle
	const pad = blend / 4 + 1;
	const bottom = reach + pad;
	if (count === 0) {
		return { values: blobs, x: 0, y: 0, width: 0, height: 0, amberY: 0, beads };
	}
	return {
		values: blobs,
		x: -side - pad,
		y: highest - pad,
		width: 2 * (side + pad),
		height: bottom - highest + pad,
		amberY: amber > 0 ? radius * amberLevel(amber) : bottom,
		beads,
	};
}
