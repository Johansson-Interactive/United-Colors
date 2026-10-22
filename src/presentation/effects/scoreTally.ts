import { layoutDotMatrix } from "../dotmatrix/layout";
import {
	fitBatch,
	POP_DOT_CELL,
	POP_DOT_PX,
	POP_DOT_SPRITE,
	POP_GLOW_CELL,
	POP_GLOW_SPRITE,
	type SpriteBatch,
	type SpriteKit,
	spriteBatch,
} from "../dotSprites";
import { COMBO_AMBER } from "../theme/theme";
import { BURST_COLORS, NOT_STARTED } from "./burstFrames";
import type { EffectReducer } from "./effectLane";
import { SCORE_BUMP_MS, scoreBumpScale } from "./scoreBump";

/**
 * Pure stepper behind the score meter: how the total takes a catch in. A catch sends its points
 * to the total as score slivers (see GLOSSARY.md): one after another from where it happened,
 * every `tick` ms (quicker for a big catch, so none takes much longer than DRAIN_MS), each
 * flying straight at the total's middle at the stage's one steady speed (see sliverSpeed) and
 * counted as it reaches the edge of the total's digits, where it vanishes, with a small bump; a
 * catch's last sliver bumps the total hard. So a catch far from the total takes longer to count
 * in than a near one, catches stream in side by side, and a near catch can count in before an
 * earlier, far one. While a combo's slivers (those in combo amber, see payColor) count in, the
 * total turns amber too: from the first of them arriving until none of them is left to arrive
 * (see tallyInCombo).
 *
 * The tally keeps its own clock, the run's: it stands still while the run is paused, so slivers
 * in the air freeze with the field and fly on once play resumes. Frame times come in as the
 * frame clock has them, and the tally's run time is the frame time less the time spent frozen.
 *
 * The list lives on the UI thread, as the bursts do (see burstFrames.ts): the JS thread queues
 * a catch, a freeze or a reset (withItem), the UI thread stamps each catch on its first frame
 * and drops it when it is done (advanceTally), and packs each frame's dots (packTally).
 */

/** The total's dot spacing (px) and its dot radius as a fraction of it, as the HUD had it */
export const SCORE_PITCH = 7;
const SCORE_DOT_SCALE = 0.38;
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
/** A sliver's radius (px), and how much of it it has lost by the time it arrives */
export const SLIVER_RADIUS = 3;
const SLIVER_SHRINK = 0.4;
/** A sliver's bump, as a fraction of a catch's last */
const POINT_BUMP = 0.35;
/** The combo's amber, by index into BURST_COLORS */
const AMBER = BURST_COLORS.indexOf(COMBO_AMBER);
/** Rows of a glyph */
const GLYPH_ROWS = 7;
const GLYPH_COLS = 5;
const DIGIT_CELLS = GLYPH_COLS + 1;

/** Each digit's dots as (col, row) pairs within its 5x7 cell */
const DIGIT_DOTS: readonly (readonly number[])[] = "0123456789".split("").map((digit) => {
	const dots: number[] = [];
	for (const dot of layoutDotMatrix(digit).dots) dots.push(dot.col, dot.row);
	return dots;
});

/** One catch on its way into the total, its times in run time (see Tally) */
export interface TallyCatch {
	id: number;
	value: number;
	/** Index into BURST_COLORS */
	color: number;
	/** Where it happened (stage px), which its slivers leave from */
	x: number;
	y: number;
	/** How long each of its slivers is in the air (ms): from where it happened to the total's edge */
	flight: number;
	/** The run time it was first drawn at, which its first sliver leaves at, or NOT_STARTED */
	at: number;
	/** The time between its slivers (ms) */
	tick: number;
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
	/** Frame time spent frozen, which the run time leaves out */
	frozenFor: number;
	/** The frame time the tally froze at, or NOT_STARTED while it runs */
	frozenAt: number;
	/** Whether the run is paused, as the JS thread last asked; the next frame freezes or thaws to it */
	freeze: boolean;
}

/** What the JS thread hands the tally: a catch, the run pausing or resuming, or a new run's score */
export type TallyItem =
	| { kind: "catch"; catch: TallyCatch }
	| { kind: "freeze"; frozen: boolean }
	| { kind: "reset"; score: number };

export function createTally(score: number): Tally {
	return {
		settled: score,
		catches: [],
		lastLand: NOT_STARTED,
		amberLit: false,
		frozenFor: 0,
		frozenAt: NOT_STARTED,
		freeze: false,
	};
}

/** The time between a catch's slivers: DRAIN_MS spread over them, within the bounds */
export function tickFor(value: number): number {
	return Math.max(TICK_MIN_MS, Math.min(TICK_MAX_MS, DRAIN_MS / Math.max(1, value)));
}

/** Where the meter draws: the total's centre, and the slivers' speed (px/ms, see sliverSpeed) */
export interface TallyGeometry {
	cx: number;
	cy: number;
	speed: number;
}

/**
 * The slivers' one speed (px/ms) on a stage `width` by `height`: a sliver from the far bottom
 * corner reaches the total, centred at `cy`, in FAR_FLIGHT_MS
 */
export function sliverSpeed(width: number, height: number, cy: number): number {
	return Math.hypot(width / 2, height - cy) / FAR_FLIGHT_MS;
}

/** The columns a number takes in the dot alphabet, gaps included */
function digitCols(value: number): number {
	"worklet";
	const digits = value < 10 ? 1 : value < 100 ? 2 : value < 1000 ? 3 : String(value).length;
	return digits * DIGIT_CELLS - 1;
}

/** The total's half width and half height (px) for `score` */
function totalHalfSize(score: number): { hw: number; hh: number } {
	"worklet";
	return { hw: (digitCols(score) * SCORE_PITCH) / 2, hh: (GLYPH_ROWS * SCORE_PITCH) / 2 };
}

/**
 * How long a sliver from (`x`, `y`) is in the air (ms): its way straight toward the total's
 * centre, up to the edge of `score`'s digits, at the geometry's speed. None from inside them.
 */
export function flightFor(x: number, y: number, score: number, geometry: TallyGeometry): number {
	const { hw, hh } = totalHalfSize(score);
	const dx = x - geometry.cx;
	const dy = y - geometry.cy;
	const distance = Math.hypot(dx, dy);
	if (distance === 0) return 0;
	// How far from the centre the line to (x, y) leaves the digits' box
	const inside = Math.min(
		dx === 0 ? Number.POSITIVE_INFINITY : (hw * distance) / Math.abs(dx),
		dy === 0 ? Number.POSITIVE_INFINITY : (hh * distance) / Math.abs(dy),
	);
	return Math.max(0, distance - inside) / geometry.speed;
}

/**
 * A catch worth `value` in `color` at (`x`, `y`), to queue before the UI thread stamps it,
 * flying in to a total of `score` (the score with it taken in, which sizes the digits it aims at)
 */
export function newCatch(
	id: number,
	value: number,
	color: string,
	x: number,
	y: number,
	score: number,
	geometry: TallyGeometry,
): TallyItem {
	const index = BURST_COLORS.indexOf(color);
	return {
		kind: "catch",
		catch: {
			id,
			value,
			color: index < 0 ? BURST_COLORS.length - 1 : index,
			x,
			y,
			flight: flightFor(x, y, score, geometry),
			at: NOT_STARTED,
			tick: tickFor(value),
		},
	};
}

/** The run pausing (`frozen`) or resuming, for the tally to follow on its next frame */
export function freezeTally(frozen: boolean): TallyItem {
	return { kind: "freeze", frozen };
}

/** A new run (or none) at `score`: everything on its way is dropped */
export function resetTally(score: number): TallyItem {
	return { kind: "reset", score };
}

/** `tally` with `item` taken in: a catch queued at the end, a freeze asked for, or a fresh tally */
export function withItem(tally: Tally, item: TallyItem): Tally {
	"worklet";
	if (item.kind === "reset") {
		return {
			settled: item.score,
			catches: [],
			lastLand: NOT_STARTED,
			amberLit: false,
			frozenFor: 0,
			frozenAt: NOT_STARTED,
			freeze: tally.freeze,
		};
	}
	if (item.kind === "freeze") return { ...tally, freeze: item.frozen };
	const c = item.catch;
	// A copy made here, so the thread that stamps it owns it
	const catches = tally.catches.slice();
	catches.push({
		id: c.id,
		value: c.value,
		color: c.color,
		x: c.x,
		y: c.y,
		flight: c.flight,
		at: c.at,
		tick: c.tick,
	});
	return { ...tally, catches };
}

/** The run time at frame time `now`: the frame time less the time frozen, standing while frozen */
function runTime(tally: Tally, now: number): number {
	"worklet";
	return (tally.frozenAt === NOT_STARTED ? now : tally.frozenAt) - tally.frozenFor;
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

/** How many of `c`'s slivers have left by run time `t` */
function departed(c: TallyCatch, t: number): number {
	"worklet";
	if (c.at === NOT_STARTED || t < c.at) return 0;
	return Math.min(c.value, Math.floor((t - c.at) / c.tick) + 1);
}

/** How many of `c`'s slivers have landed by run time `t` */
function landed(c: TallyCatch, t: number): number {
	"worklet";
	return departed(c, t - c.flight);
}

/**
 * Advance the tally to frame time `now`: it freezes or thaws as last asked, a catch not yet
 * drawn starts now (stamped in place), and a catch that is over is dropped into the settled
 * score. Returns `tally` itself unless it froze, thawed or dropped a catch.
 */
export function advanceTally(tally: Tally, now: number): Tally {
	"worklet";
	let next = tally;
	if (tally.freeze && tally.frozenAt === NOT_STARTED) {
		next = { ...tally, frozenAt: now };
	} else if (!tally.freeze && tally.frozenAt !== NOT_STARTED) {
		next = { ...tally, frozenAt: NOT_STARTED, frozenFor: tally.frozenFor + now - tally.frozenAt };
	}
	const t = runTime(next, now);
	const list = next.catches;
	for (let i = 0; i < list.length; i++) {
		if (list[i].at === NOT_STARTED) list[i].at = t;
	}
	let settled = next.settled;
	let lastLand = next.lastLand;
	let amberLit = next.amberLit;
	const catches: TallyCatch[] = [];
	let amberLeft = false;
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		if (t >= endOf(c)) {
			settled += c.value;
			lastLand = Math.max(lastLand, endOf(c));
			if (c.color === AMBER) amberLit = true;
		} else {
			catches.push(c);
			if (c.color === AMBER) amberLeft = true;
		}
	}
	if (catches.length === list.length) return next;
	return { ...next, settled, catches, lastLand, amberLit: amberLit && amberLeft };
}

/** The score the meter shows at frame time `now`: every sliver that has landed */
export function shownScore(tally: Tally, now: number): number {
	"worklet";
	const t = runTime(tally, now);
	let shown = tally.settled;
	for (let i = 0; i < tally.catches.length; i++) shown += landed(tally.catches[i], t);
	return shown;
}

/**
 * Whether the total shows in combo amber at frame time `now`: from the first amber sliver
 * arriving until no amber sliver is left to arrive. Slivers of catches outside the combo may
 * land in between; the total stays amber across them.
 */
export function tallyInCombo(tally: Tally, now: number): boolean {
	"worklet";
	const t = runTime(tally, now);
	let arrived = tally.amberLit;
	let left = false;
	for (let i = 0; i < tally.catches.length; i++) {
		const c = tally.catches[i];
		if (c.color !== AMBER) continue;
		const n = landed(c, t);
		if (n > 0) arrived = true;
		if (n < c.value) left = true;
	}
	return arrived && left;
}

/** Whether nothing is moving at frame time `now`, so the frame clock may stop */
export function tallyIdle(tally: Tally, now: number): boolean {
	"worklet";
	// A freeze or a thaw asked for is still to be taken
	if (tally.freeze !== (tally.frozenAt !== NOT_STARTED)) return false;
	if (tally.frozenAt !== NOT_STARTED) return true;
	return (
		tally.catches.length === 0 &&
		(tally.lastLand === NOT_STARTED || runTime(tally, now) - tally.lastLand >= SCORE_BUMP_MS)
	);
}

/** Whether any sliver is still to arrive, so the game over waits (see screenFlow.ts) */
export function sliversInAir(tally: Tally): boolean {
	"worklet";
	return tally.catches.length > 0;
}

/** The score meter's effect lane: catches queued on the JS thread, counted into the total on the UI thread */
export const TALLY: EffectReducer<Tally, TallyItem> = {
	add: withItem,
	advance: advanceTally,
	idle: tallyIdle,
};

/** A dot's fields in TallyFrame.dots */
export const DOT_STRIDE = 5;

/** Everything the meter draws in a frame, rewritten in place each frame */
export interface TallyFrame {
	/** The score drawn */
	shown: number;
	/** Whether the total shows in combo amber (see tallyInCombo) */
	combo: boolean;
	/** The total's dots: x, y, radius per dot */
	total: number[];
	/** The slivers in the air: x, y, radius, colour index (BURST_COLORS), alpha per dot */
	dots: number[];
}

export function tallyFrame(): TallyFrame {
	"worklet";
	return { shown: 0, combo: false, total: [], dots: [] };
}

/**
 * Lay the digits of `value` into `out` at `pitch`, the text's box with its left at `left` and
 * its vertical centre at `cy`, scaled by `scale` about (`ox`, `oy`), each dot of radius `radius`
 */
function layDigits(
	out: number[],
	value: number,
	pitch: number,
	left: number,
	cy: number,
	radius: number,
	scale: number,
	ox: number,
	oy: number,
): void {
	"worklet";
	const text = String(value);
	const top = cy - (GLYPH_ROWS / 2) * pitch;
	for (let i = 0; i < text.length; i++) {
		const dots = DIGIT_DOTS[text.charCodeAt(i) - 48];
		const cellLeft = left + i * DIGIT_CELLS * pitch;
		for (let k = 0; k < dots.length; k += 2) {
			const x = cellLeft + (dots[k] + 0.5) * pitch;
			const y = top + (dots[k + 1] + 0.5) * pitch;
			out.push(ox + (x - ox) * scale, oy + (y - oy) * scale, radius * scale);
		}
	}
}

/**
 * The slivers in the air at run time `t`: each from where its catch happened straight toward
 * the total's centre at (`cx`, `cy`) at `speed` (px/ms), so it reaches the digits' edge as its
 * flight ends, shrinking a little on the way
 */
function packSlivers(
	list: readonly TallyCatch[],
	t: number,
	cx: number,
	cy: number,
	speed: number,
	out: number[],
): void {
	"worklet";
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		const d = departed(c, t);
		const l = landed(c, t);
		if (d === l) continue;
		const distance = Math.hypot(cx - c.x, cy - c.y);
		const ux = (cx - c.x) / distance;
		const uy = (cy - c.y) / distance;
		for (let k = l; k < d; k++) {
			const age = t - (c.at + k * c.tick);
			const e = age / c.flight;
			out.push(
				c.x + ux * age * speed,
				c.y + uy * age * speed,
				SLIVER_RADIUS * (1 - SLIVER_SHRINK * e),
				c.color,
				1,
			);
		}
	}
}

/**
 * Pack what the meter draws at frame time `now` into `out`, with the total centred at the
 * geometry's (cx, cy)
 */
export function packTally(
	tally: Tally,
	now: number,
	geometry: TallyGeometry,
	out: TallyFrame,
): void {
	"worklet";
	const { cx, cy } = geometry;
	const list = tally.catches;
	const t = runTime(tally, now);
	out.total.length = 0;
	out.dots.length = 0;

	// The total, bumped by the newest landing: hard for a catch's last sliver, lightly otherwise
	const shown = shownScore(tally, now);
	out.shown = shown;
	out.combo = tallyInCombo(tally, now);
	let bumpAt = tally.lastLand;
	let bumpFinal = true;
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		const n = landed(c, t);
		if (n === 0) continue;
		const at = c.at + (n - 1) * c.tick + c.flight;
		if (at > bumpAt) {
			bumpAt = at;
			bumpFinal = n === c.value;
		}
	}
	let scale = 1;
	if (bumpAt !== NOT_STARTED) {
		const swell = scoreBumpScale((t - bumpAt) / SCORE_BUMP_MS) - 1;
		scale = 1 + swell * (bumpFinal ? 1 : POINT_BUMP);
	}
	const totalWidth = digitCols(shown) * SCORE_PITCH;
	layDigits(
		out.total,
		shown,
		SCORE_PITCH,
		cx - totalWidth / 2,
		cy,
		SCORE_PITCH * SCORE_DOT_SCALE,
		scale,
		cx,
		cy,
	);

	packSlivers(list, t, cx, cy, geometry.speed, out.dots);
}

/** The meter's dots as sprites, for two tinted drawAtlas calls (see dotSprites.ts) */
export interface TallySprites<P, R> {
	/** Every dot's glow, then every dot, tinted by its colour */
	glows: SpriteBatch<P, R>;
	dots: SpriteBatch<P, R>;
	/** The glow and dot cells (see POP_GLOW_SPRITE, POP_DOT_SPRITE) */
	glowCell: R;
	dotCell: R;
	/** One tint per dot drawn, rewritten each frame; grown as a frame needs */
	tints: Float32Array[];
}

/** Fresh buffers to pack into, for the thread that draws the meter (see SpriteKit) */
export function tallySprites<P, R>(kit: SpriteKit<P, R>): TallySprites<P, R> {
	"worklet";
	return {
		glows: spriteBatch(kit),
		dots: spriteBatch(kit),
		glowCell: kit.rect(POP_GLOW_SPRITE),
		dotCell: kit.rect(POP_DOT_SPRITE),
		tints: [],
	};
}

/**
 * Pack a packed frame's dots as sprites into `out`: the total in `scoreColor`, or in combo
 * amber while the frame says so, every other
 * dot in its colour from `colors` (BURST_COLORS as Skia colours) at its alpha
 */
export function packTallySprites<P, R>(
	frame: TallyFrame,
	colors: readonly Float32Array[],
	scoreColor: Float32Array,
	out: TallySprites<P, R>,
): void {
	"worklet";
	const totalCount = frame.total.length / 3;
	const dotCount = frame.dots.length / DOT_STRIDE;
	const n = totalCount + dotCount;
	const { glows, dots, tints } = out;
	while (tints.length < n) tints.push(new Float32Array(4));
	fitBatch(glows, n, out.glowCell, colors[0]);
	fitBatch(dots, n, out.dotCell, colors[0]);
	const glowCells = glows.cells[n];
	const glowColors = glows.colors[n];
	const dotCells = dots.cells[n];
	const dotColors = dots.colors[n];
	const glowHalf = POP_GLOW_CELL / 2;
	const dotHalf = POP_DOT_CELL / 2;
	const totalColor = frame.combo ? colors[AMBER] : scoreColor;
	let d = 0;
	for (let i = 0; i < n; i++) {
		let x: number;
		let y: number;
		let radius: number;
		const tint = tints[i];
		if (i < totalCount) {
			const o = i * 3;
			x = frame.total[o];
			y = frame.total[o + 1];
			radius = frame.total[o + 2];
			tint[0] = totalColor[0];
			tint[1] = totalColor[1];
			tint[2] = totalColor[2];
			tint[3] = totalColor[3];
		} else {
			const o = (i - totalCount) * DOT_STRIDE;
			x = frame.dots[o];
			y = frame.dots[o + 1];
			radius = frame.dots[o + 2];
			const color = colors[frame.dots[o + 3]];
			tint[0] = color[0];
			tint[1] = color[1];
			tint[2] = color[2];
			tint[3] = color[3] * frame.dots[o + 4];
		}
		// Both cells scale about their centres, which land on the dot's; the glow cell is the
		// dot cell's glow, so one scale sizes both
		const s = radius / POP_DOT_PX;
		glows.place[d](s, 0, x - s * glowHalf, y - s * glowHalf);
		glowCells[d] = out.glowCell;
		glowColors[d] = tint;
		dots.place[d](s, 0, x - s * dotHalf, y - s * dotHalf);
		dotCells[d] = out.dotCell;
		dotColors[d] = tint;
		d++;
	}
}
