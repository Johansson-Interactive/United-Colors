import { layoutDotMatrix } from "../dotmatrix/layout";
import { COMBO_AMBER } from "../theme/theme";
import { BURST_COLORS, NOT_STARTED } from "./burstFrames";
import type { EffectReducer } from "./effectLane";
import { SCORE_BUMP_MS } from "./scoreBump";

/**
 * Pure stepper behind the score meter: how the total takes a catch in. A catch sends its points
 * to the total as score slivers (see GLOSSARY.md): one after another from where it happened,
 * every `tick` ms (quicker for a big catch, so none takes much longer than DRAIN_MS), each
 * flying straight at the total's middle at the stage's one steady speed (see sliverSpeed) and
 * counted as it reaches the edge of the total's digits, where it vanishes. So a catch far from
 * the total takes longer to count in than a near one, catches stream in side by side, and a
 * near catch can count in before an earlier, far one. While a combo's slivers (those in combo
 * amber, see payColor) count in, the total turns amber too: from the first of them arriving
 * until none of them is left to arrive (see tallyInCombo).
 *
 * The tally's time is its effect lane's, which stands still while the run is paused (see
 * effectLane.ts), so slivers in the air freeze with the field and fly on once play resumes.
 *
 * The list lives on the UI thread, as the bursts do (see burstFrames.ts): the JS thread queues
 * a catch (withCatch), the UI thread stamps it on its first frame, aiming its slivers at the
 * total as it then stands, and drops it when it is done (advanceTally). What a frame draws is
 * tallyPack.ts's.
 */

/** The total's dot spacing (px) */
export const SCORE_PITCH = 7;
/** The total's offset below the stage's top (px), and the room it keeps above it for its glow and its bump */
export const SCORE_TOP = 10;
const SCORE_PAD = 10;
/** The total's centre line below the stage's top (px), where the paused score returns to */
export const SCORE_CENTRE_Y = SCORE_TOP + SCORE_PAD + (SCORE_PITCH * 7) / 2;
/** About how long a catch takes to send its slivers, and the bounds on the time between them (ms) */
export const DRAIN_MS = 480;
export const TICK_MIN_MS = 24;
export const TICK_MAX_MS = 60;
/** How long a sliver takes from the stage's far bottom corner to the total (ms); sets the speed */
export const FAR_FLIGHT_MS = 600;
/** The combo's amber, by index into BURST_COLORS */
export const AMBER = BURST_COLORS.indexOf(COMBO_AMBER);
/** Rows and columns of a glyph */
export const GLYPH_ROWS = 7;
const GLYPH_COLS = 5;
/** Columns a digit takes, its gap included */
export const DIGIT_CELLS = GLYPH_COLS + 1;

/** Each digit's dots as (col, row) pairs within its 5x7 cell */
export const DIGIT_DOTS: readonly (readonly number[])[] = "0123456789".split("").map((digit) => {
	const dots: number[] = [];
	for (const dot of layoutDotMatrix(digit).dots) dots.push(dot.col, dot.row);
	return dots;
});

/** The columns a number takes in the dot alphabet, gaps included */
export function digitCols(value: number): number {
	"worklet";
	const digits = value < 10 ? 1 : value < 100 ? 2 : value < 1000 ? 3 : String(value).length;
	return digits * DIGIT_CELLS - 1;
}

/** Where the total stands: its centre (stage px), and the slivers' speed (px/ms, see sliverSpeed) */
export interface TallyGeometry {
	cx: number;
	cy: number;
	speed: number;
}

/**
 * Where the total stands on a stage `width` by `height`: at the top centre, its slivers at
 * the one speed that brings one from the far bottom corner to its centre in FAR_FLIGHT_MS
 */
export function placeTotal(width: number, height: number): TallyGeometry {
	const cy = SCORE_CENTRE_Y;
	return { cx: width / 2, cy, speed: Math.hypot(width / 2, height - cy) / FAR_FLIGHT_MS };
}

/** One catch on its way into the total */
export interface TallyCatch {
	value: number;
	/** Index into BURST_COLORS */
	color: number;
	/** Where it happened (stage px), which its slivers leave from */
	x: number;
	y: number;
	/** The time between its slivers (ms) */
	tick: number;
	/** The lane time it was first drawn at, which its first sliver leaves at, or NOT_STARTED */
	at: number;
	/** Where its slivers vanish, on the edge of the total's digits (set with `at`) */
	toX: number;
	toY: number;
	/** How long each of its slivers is in the air (ms, set with `at`) */
	flight: number;
}

/** The score as the meter shows it */
export interface Tally {
	/** The score with every catch taken in */
	settled: number;
	/** The catches still on their way, oldest first */
	catches: TallyCatch[];
	/** When the last sliver of a dropped catch landed, so its bump plays out (NOT_STARTED before any) */
	lastLand: number;
	/** A dropped catch was in combo amber and amber catches are still on their way (see tallyInCombo) */
	amberLit: boolean;
	/** Where the total stands, which a new catch aims its slivers at */
	geometry: TallyGeometry;
}

/** Where the total stands before the stage is laid out: slivers from anywhere count at once */
export const UNPLACED: TallyGeometry = { cx: 0, cy: 0, speed: Number.POSITIVE_INFINITY };

export function createTally(score: number, geometry: TallyGeometry): Tally {
	"worklet";
	return { settled: score, catches: [], lastLand: NOT_STARTED, amberLit: false, geometry };
}

/** `tally` started over at a new run's `score`, standing where it stood */
export function resetTally(tally: Tally, score: number): Tally {
	"worklet";
	return createTally(score, tally.geometry);
}

/** `tally` with the total standing at `geometry`, for the catches still to be stamped */
export function withGeometry(tally: Tally, geometry: TallyGeometry): Tally {
	"worklet";
	return { ...tally, geometry };
}

/** The time between a catch's slivers: DRAIN_MS spread over them, within the bounds */
export function tickFor(value: number): number {
	return Math.max(TICK_MIN_MS, Math.min(TICK_MAX_MS, DRAIN_MS / Math.max(1, value)));
}

/** A catch worth `value` in `color` at (`x`, `y`), to queue before the UI thread stamps it */
export function newCatch(value: number, color: string, x: number, y: number): TallyCatch {
	const index = BURST_COLORS.indexOf(color);
	return {
		value,
		color: index < 0 ? BURST_COLORS.length - 1 : index,
		x,
		y,
		tick: tickFor(value),
		at: NOT_STARTED,
		toX: x,
		toY: y,
		flight: 0,
	};
}

/** `tally` with `c` queued at the end */
export function withCatch(tally: Tally, c: TallyCatch): Tally {
	"worklet";
	// A copy made here, so the thread that stamps it owns it
	return { ...tally, catches: [...tally.catches, { ...c }] };
}

/**
 * Aim `c` at a total of `score` standing at `geometry`: its slivers fly straight toward the
 * total's centre and vanish where that line meets the edge of the digits, at the geometry's
 * speed. None fly from inside the digits.
 */
export function aimCatch(c: TallyCatch, score: number, geometry: TallyGeometry): void {
	"worklet";
	const dx = c.x - geometry.cx;
	const dy = c.y - geometry.cy;
	const distance = Math.hypot(dx, dy);
	const halfWidth = (digitCols(score) * SCORE_PITCH) / 2;
	const halfHeight = (GLYPH_ROWS * SCORE_PITCH) / 2;
	// How far from the centre the line to the catch leaves the digits' box
	const inside = Math.min(
		dx === 0 ? Number.POSITIVE_INFINITY : (halfWidth * distance) / Math.abs(dx),
		dy === 0 ? Number.POSITIVE_INFINITY : (halfHeight * distance) / Math.abs(dy),
	);
	const way = Math.max(0, distance - inside);
	const share = distance === 0 ? 0 : way / distance;
	c.toX = c.x - dx * share;
	c.toY = c.y - dy * share;
	c.flight = way / geometry.speed;
}

/** When catch `c`'s last sliver leaves */
function lastDepart(c: TallyCatch): number {
	"worklet";
	return c.at + (c.value - 1) * c.tick;
}

/** When catch `c` is over: its last sliver has landed */
function endOf(c: TallyCatch): number {
	"worklet";
	return lastDepart(c) + c.flight;
}

/** How many of `c`'s slivers have left by `now` */
export function departed(c: TallyCatch, now: number): number {
	"worklet";
	if (c.at === NOT_STARTED || now < c.at) return 0;
	return Math.min(c.value, Math.floor((now - c.at) / c.tick) + 1);
}

/** How many of `c`'s slivers have landed by `now` */
export function landed(c: TallyCatch, now: number): number {
	"worklet";
	return departed(c, now - c.flight);
}

/** The score the meter shows at `now`: every sliver that has landed */
export function shownScore(tally: Tally, now: number): number {
	"worklet";
	let shown = tally.settled;
	for (let i = 0; i < tally.catches.length; i++) shown += landed(tally.catches[i], now);
	return shown;
}

/**
 * Advance the tally to lane time `now`: a catch not yet drawn starts now, aimed at the total as
 * it stands (stamped in place), and a catch that is over is dropped into the settled score.
 * Returns `tally` itself unless one was dropped.
 */
export function advanceTally(tally: Tally, now: number): Tally {
	"worklet";
	const list = tally.catches;
	for (let i = 0; i < list.length; i++) {
		if (list[i].at !== NOT_STARTED) continue;
		list[i].at = now;
		aimCatch(list[i], shownScore(tally, now), tally.geometry);
	}
	let settled = tally.settled;
	let lastLand = tally.lastLand;
	let amberLit = tally.amberLit;
	let amberLeft = false;
	const catches: TallyCatch[] = [];
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		if (now >= endOf(c)) {
			settled += c.value;
			lastLand = Math.max(lastLand, endOf(c));
			if (c.color === AMBER) amberLit = true;
		} else {
			catches.push(c);
			if (c.color === AMBER) amberLeft = true;
		}
	}
	if (catches.length === list.length) return tally;
	return { ...tally, settled, catches, lastLand, amberLit: amberLit && amberLeft };
}

/**
 * Whether the total shows in combo amber at `now`: from the first amber sliver arriving until
 * no amber sliver is left to arrive. Slivers of catches outside the combo may land in between;
 * the total stays amber across them.
 */
export function tallyInCombo(tally: Tally, now: number): boolean {
	"worklet";
	let arrived = tally.amberLit;
	let left = false;
	for (let i = 0; i < tally.catches.length; i++) {
		const c = tally.catches[i];
		if (c.color !== AMBER) continue;
		const n = landed(c, now);
		if (n > 0) arrived = true;
		if (n < c.value) left = true;
	}
	return arrived && left;
}

/** Whether nothing is moving at `now`, so the frame clock may stop */
export function tallyIdle(tally: Tally, now: number): boolean {
	"worklet";
	return (
		tally.catches.length === 0 &&
		(tally.lastLand === NOT_STARTED || now - tally.lastLand >= SCORE_BUMP_MS)
	);
}

/** Whether any sliver is still to arrive, so the game over waits (see screenFlow.ts) */
export function sliversInAir(tally: Tally): boolean {
	"worklet";
	return tally.catches.length > 0;
}

/** The score meter's effect lane: catches queued on the JS thread, counted into the total on the UI thread */
export const TALLY: EffectReducer<Tally, TallyCatch> = {
	add: withCatch,
	advance: advanceTally,
	idle: tallyIdle,
};
