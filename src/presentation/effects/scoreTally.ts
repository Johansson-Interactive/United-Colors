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
import { SCORE_BUMP_MS, scoreBumpScale } from "./scoreBump";

/**
 * Pure stepper behind the score meter: how the total takes a catch in. A catch no longer pops
 * where it landed; it goes to the top, where the total counts it in one point at a time, so
 * the catch is seen arriving and the total is seen growing. Two styles, chosen by the shell:
 *
 *   feed      The catch's points queue up as a ribbon of dots beside the total, in the
 *             catch's colour, and the total eats them front first, the ribbon crawling in.
 *   transfer  The catch's value is written under the total in the catch's colour, like a sum,
 *             and counts down to nothing as the total counts up: one dot crosses per point.
 *
 * Each catch keeps its own schedule once stamped: it holds for a beat, then drains one point
 * every `tick` ms (quicker for a big catch, so none takes much longer than DRAIN_MS), after
 * the catch before it has drained. Each point flies to the total's last digit and is counted
 * when it lands, with a small bump; a catch's last point bumps the total hard. A catch past
 * MAX_PENDING is counted at once, so a long combo never queues further than the eye follows.
 * While a combo's catches (those in combo amber, see payColor) count in, the total turns amber
 * too, from the first of their points leaving until the last has landed (see tallyInCombo).
 *
 * The list lives on the UI thread, as the bursts do (see burstFrames.ts): the JS thread queues
 * a catch (withCatch), the UI thread stamps and schedules it on its first frame and drops it
 * when it is done (advanceTally), and packs each frame's dots (packTally).
 */

export type TallyStyle = "feed" | "transfer";

/** The total's dot spacing (px) and its dot radius as a fraction of it, as the HUD had it */
export const SCORE_PITCH = 7;
const SCORE_DOT_SCALE = 0.38;
/** The meter's offset below the stage's top (px), and the room it keeps above the total for its glow and its bump */
export const SCORE_TOP = 10;
export const SCORE_PAD = 10;
/** The total's centre line below the stage's top (px), where the paused score returns to */
export const SCORE_CENTRE_Y = SCORE_TOP + SCORE_PAD + (SCORE_PITCH * 7) / 2;
/** The feed's ribbon: its dot spacing, how many rows, its gap from the total, its dot radius */
export const FEED_PITCH = 5;
export const FEED_ROWS = 3;
const FEED_GAP = 12;
const FEED_DOT_SCALE = 0.42;
/** An addend's dot spacing, its gap below the total and between lines, its dot radius */
export const ADDEND_PITCH = 5;
const ADDEND_GAP = 8;
const ADDEND_LINE_GAP = 6;
const ADDEND_DOT_SCALE = 0.38;
/** How long a catch is seen before it drains (ms) */
export const HOLD_MS = 140;
/** About how long a catch takes to drain, and the bounds on the time between its points (ms) */
export const DRAIN_MS = 480;
export const TICK_MIN_MS = 24;
export const TICK_MAX_MS = 60;
/** How long a point is in the air (ms) */
export const FLIGHT_MS = 120;
/** How long a dot or an addend takes to pop in (ms), and the feed's stagger between dots */
const POP_IN_MS = 110;
const FEED_APPEAR_MS = 8;
/** How long the lines under the total take to close up over a spent addend (ms) */
export const SHIFT_MS = 160;
/** A point's bump, as a fraction of a catch's last */
const POINT_BUMP = 0.35;
/** Catches queued at once; one more counts the oldest at once */
export const MAX_PENDING = 8;
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

/** One catch on its way into the total */
export interface TallyCatch {
	id: number;
	value: number;
	/** Index into BURST_COLORS */
	color: number;
	/** The UI frame time it was first drawn at, or NOT_STARTED */
	at: number;
	/** When its first point leaves (set with `at`) */
	start: number;
	/** The time between its points (ms) */
	tick: number;
}

/** The score as the meter shows it */
export interface Tally {
	/** The score with every catch taken in */
	settled: number;
	/** The catches still on their way, oldest first */
	catches: TallyCatch[];
	/** When the last point of a dropped catch landed, so its bump plays out (NOT_STARTED before any) */
	lastLand: number;
}

export function createTally(score: number): Tally {
	return { settled: score, catches: [], lastLand: NOT_STARTED };
}

/** The time between a catch's points: DRAIN_MS spread over them, within the bounds */
export function tickFor(value: number): number {
	return Math.max(TICK_MIN_MS, Math.min(TICK_MAX_MS, DRAIN_MS / Math.max(1, value)));
}

/** A catch to queue, before the UI thread stamps it */
export function newCatch(id: number, value: number, color: string): TallyCatch {
	const index = BURST_COLORS.indexOf(color);
	return {
		id,
		value,
		color: index < 0 ? BURST_COLORS.length - 1 : index,
		at: NOT_STARTED,
		start: 0,
		tick: tickFor(value),
	};
}

/** `tally` with `c` queued at the end; past MAX_PENDING the oldest is counted at once */
export function withCatch(tally: Tally, c: TallyCatch): Tally {
	"worklet";
	let settled = tally.settled;
	const catches: TallyCatch[] = [];
	const drop = Math.max(0, tally.catches.length - (MAX_PENDING - 1));
	for (let i = 0; i < tally.catches.length; i++) {
		if (i < drop) settled += tally.catches[i].value;
		else catches.push(tally.catches[i]);
	}
	// A copy made here, so the thread that stamps it owns it
	catches.push({
		id: c.id,
		value: c.value,
		color: c.color,
		at: c.at,
		start: c.start,
		tick: c.tick,
	});
	return { settled, catches, lastLand: tally.lastLand };
}

/** When catch `c`'s last point leaves */
function lastDepart(c: TallyCatch): number {
	"worklet";
	return c.start + (c.value - 1) * c.tick;
}

/** When catch `c` is over: its last point has landed and the lines under the total have closed */
function endOf(c: TallyCatch): number {
	"worklet";
	return Math.max(lastDepart(c) + FLIGHT_MS, lastDepart(c) + SHIFT_MS);
}

/** How many of `c`'s points have left by `now` */
function departed(c: TallyCatch, now: number): number {
	"worklet";
	if (c.at === NOT_STARTED || now < c.start) return 0;
	return Math.min(c.value, Math.floor((now - c.start) / c.tick) + 1);
}

/** How many of `c`'s points have landed by `now` */
function landed(c: TallyCatch, now: number): number {
	"worklet";
	return departed(c, now - FLIGHT_MS);
}

/**
 * Advance the tally to frame time `now`: a catch not yet drawn starts now, scheduled after the
 * one before it (stamped in place), and a catch that is over is dropped into the settled score.
 * Returns `tally` itself unless one was dropped.
 */
export function advanceTally(tally: Tally, now: number): Tally {
	"worklet";
	const list = tally.catches;
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		if (c.at !== NOT_STARTED) continue;
		c.at = now;
		const after = i > 0 ? lastDepart(list[i - 1]) + list[i - 1].tick : now;
		c.start = Math.max(now + HOLD_MS, after);
	}
	let over = 0;
	while (over < list.length && now >= endOf(list[over])) over++;
	if (over === 0) return tally;
	let settled = tally.settled;
	let lastLand = tally.lastLand;
	for (let i = 0; i < over; i++) {
		settled += list[i].value;
		lastLand = lastDepart(list[i]) + FLIGHT_MS;
	}
	const catches: TallyCatch[] = [];
	for (let i = over; i < list.length; i++) catches.push(list[i]);
	return { settled, catches, lastLand };
}

/** The score the meter shows at `now`: every point that has landed */
export function shownScore(tally: Tally, now: number): number {
	"worklet";
	let shown = tally.settled;
	for (let i = 0; i < tally.catches.length; i++) shown += landed(tally.catches[i], now);
	return shown;
}

/**
 * Whether the total shows in combo amber at `now`: while the catch counting in, the first
 * with a point still to land, is in amber and its first point has left. A combo's catches
 * drain back to back, so the total stays amber across them, and turns back as the last
 * point of the combo's last catch lands, or as a catch outside the combo starts to count.
 */
export function tallyInCombo(tally: Tally, now: number): boolean {
	"worklet";
	const list = tally.catches;
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		if (landed(c, now) >= c.value) continue;
		return c.color === AMBER && departed(c, now) > 0;
	}
	return false;
}

/** Whether nothing is moving at `now`, so the frame clock may stop */
export function tallyIdle(tally: Tally, now: number): boolean {
	"worklet";
	return (
		tally.catches.length === 0 &&
		(tally.lastLand === NOT_STARTED || now - tally.lastLand >= SCORE_BUMP_MS)
	);
}

/** Where the meter draws: the total's centre */
export interface TallyGeometry {
	cx: number;
	cy: number;
}

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
	/** Every other dot: x, y, radius, colour index (BURST_COLORS), alpha per dot */
	dots: number[];
}

export function tallyFrame(): TallyFrame {
	"worklet";
	return { shown: 0, combo: false, total: [], dots: [] };
}

/** Out-quad: quick off the mark, settling in */
function easeOut(t: number): number {
	"worklet";
	const left = 1 - Math.min(1, Math.max(0, t));
	return 1 - left * left;
}

/** In-out: a point leaves gently and arrives with purpose */
function easeInOut(t: number): number {
	"worklet";
	const u = Math.min(1, Math.max(0, t));
	return u * u * (3 - 2 * u);
}

/** The columns a number takes in the dot alphabet, gaps included */
function digitCols(value: number): number {
	"worklet";
	const digits = value < 10 ? 1 : value < 100 ? 2 : value < 1000 ? 3 : String(value).length;
	return digits * DIGIT_CELLS - 1;
}

/**
 * Lay the digits of `value` into `out` at `pitch`, the text's box with its left at `left` and
 * its vertical centre at `cy`, scaled by `scale` about (`ox`, `oy`), each dot of radius
 * `radius` with `color` and `alpha` (or, for the total, no colour and alpha fields)
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
	color: number,
	alpha: number,
	total: boolean,
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
			if (!total) out.push(color, alpha);
		}
	}
}

/** A point in the air from (`sx`, `sy`) to (`lx`, `ly`), `age` ms after leaving, in `color` */
function layFlight(
	out: number[],
	sx: number,
	sy: number,
	lx: number,
	ly: number,
	age: number,
	radius: number,
	color: number,
): void {
	"worklet";
	const e = easeInOut(age / FLIGHT_MS);
	out.push(sx + (lx - sx) * e, sy + (ly - sy) * e, radius * (1 - 0.4 * e), color, 1);
}

/**
 * The feed: every pending point in a ribbon FEED_ROWS high to the right of the total, point
 * `g` of the queue in row `g % FEED_ROWS` of column `g / FEED_ROWS`, the whole ribbon crawling
 * toward the total by one point per tick, so a column slides in as its points leave
 */
function packFeed(
	list: readonly TallyCatch[],
	now: number,
	totalRight: number,
	cy: number,
	landX: number,
	landY: number,
	out: number[],
): void {
	"worklet";
	const x0 = totalRight + FEED_GAP;
	const radius = FEED_PITCH * FEED_DOT_SCALE;
	// How far the ribbon has crawled: the points gone, and the way toward the next to go
	let gone = 0;
	let crawl = 0;
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		const d = departed(c, now);
		gone += d;
		if (d < c.value) {
			const next = c.at === NOT_STARTED ? Number.POSITIVE_INFINITY : c.start + d * c.tick;
			crawl = gone + Math.max(0, 1 - (next - now) / c.tick);
			break;
		}
	}
	if (crawl === 0) crawl = gone;
	let g = 0;
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		const d = departed(c, now);
		const l = landed(c, now);
		for (let k = 0; k < c.value; k++, g++) {
			const row = g % FEED_ROWS;
			const col = Math.floor(g / FEED_ROWS);
			const y = cy + (row - (FEED_ROWS - 1) / 2) * FEED_PITCH;
			if (k < l) continue;
			if (k < d) {
				// Left from where its column stood as it went
				const sx = x0 + (col - (g + 1) / FEED_ROWS) * FEED_PITCH;
				layFlight(out, sx, y, landX, landY, now - (c.start + k * c.tick), radius, c.color);
				continue;
			}
			if (c.at === NOT_STARTED) continue;
			const since = now - (c.at + k * FEED_APPEAR_MS);
			if (since < 0) continue;
			const x = x0 + (col - crawl / FEED_ROWS) * FEED_PITCH;
			out.push(x, y, radius * easeOut(since / POP_IN_MS), c.color, 1);
		}
	}
}

/**
 * The transfer: each pending catch's value left to count, written under the total and
 * right-aligned to it, one line per catch, the lines closing up over a spent one; a point
 * leaves from the middle of its line
 */
function packTransfer(
	list: readonly TallyCatch[],
	now: number,
	totalRight: number,
	totalBottom: number,
	landX: number,
	landY: number,
	out: number[],
): void {
	"worklet";
	const radius = ADDEND_PITCH * ADDEND_DOT_SCALE;
	const lineHeight = GLYPH_ROWS * ADDEND_PITCH + ADDEND_LINE_GAP;
	const firstCy = totalBottom + ADDEND_GAP + (GLYPH_ROWS / 2) * ADDEND_PITCH;
	// Lines below a spent catch rise into its place
	let shift = 0;
	if (list.length > 0 && list[0].at !== NOT_STARTED) {
		shift = easeOut((now - lastDepart(list[0])) / SHIFT_MS);
	}
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		if (c.at === NOT_STARTED) continue;
		const d = departed(c, now);
		const l = landed(c, now);
		const remaining = c.value - d;
		const lineCy = firstCy + (i - shift) * lineHeight;
		const width = digitCols(Math.max(1, remaining)) * ADDEND_PITCH;
		const lineCx = totalRight - width / 2;
		for (let k = l; k < d; k++) {
			layFlight(out, lineCx, lineCy, landX, landY, now - (c.start + k * c.tick), radius, c.color);
		}
		if (remaining === 0) continue;
		const popIn = 0.7 + 0.3 * easeOut((now - c.at) / POP_IN_MS);
		layDigits(
			out,
			remaining,
			ADDEND_PITCH,
			totalRight - width,
			lineCy,
			radius,
			popIn,
			lineCx,
			lineCy,
			c.color,
			1,
			false,
		);
	}
}

/**
 * Pack what the meter draws at frame time `now` into `out`, in `style`, with the total centred
 * at the geometry's (cx, cy)
 */
export function packTally(
	tally: Tally,
	now: number,
	style: TallyStyle,
	geometry: TallyGeometry,
	out: TallyFrame,
): void {
	"worklet";
	const { cx, cy } = geometry;
	const list = tally.catches;
	out.total.length = 0;
	out.dots.length = 0;

	// The total, bumped by the newest landing: hard for a catch's last point, lightly otherwise
	const shown = shownScore(tally, now);
	out.shown = shown;
	out.combo = tallyInCombo(tally, now);
	let bumpAt = tally.lastLand;
	let bumpFinal = true;
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		const n = landed(c, now);
		if (n === 0) continue;
		const at = c.start + (n - 1) * c.tick + FLIGHT_MS;
		if (at > bumpAt) {
			bumpAt = at;
			bumpFinal = n === c.value;
		}
	}
	let scale = 1;
	if (bumpAt !== NOT_STARTED) {
		const swell = scoreBumpScale((now - bumpAt) / SCORE_BUMP_MS) - 1;
		scale = 1 + swell * (bumpFinal ? 1 : POINT_BUMP);
	}
	const totalWidth = digitCols(shown) * SCORE_PITCH;
	const totalLeft = cx - totalWidth / 2;
	const totalRight = cx + totalWidth / 2;
	layDigits(
		out.total,
		shown,
		SCORE_PITCH,
		totalLeft,
		cy,
		SCORE_PITCH * SCORE_DOT_SCALE,
		scale,
		cx,
		cy,
		0,
		1,
		true,
	);
	// Where a point lands: the last digit's centre
	const landX = totalRight - (GLYPH_COLS / 2) * SCORE_PITCH;
	const landY = cy;

	if (style === "feed") {
		packFeed(list, now, totalRight, cy, landX, landY, out.dots);
	} else {
		packTransfer(
			list,
			now,
			totalRight,
			cy + (GLYPH_ROWS / 2) * SCORE_PITCH,
			landX,
			landY,
			out.dots,
		);
	}
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
