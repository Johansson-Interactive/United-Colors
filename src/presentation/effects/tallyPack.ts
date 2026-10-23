import { GLYPH_ROWS } from "../dotmatrix/glyphs";
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
import { NOT_STARTED } from "./burstFrames";
import { SCORE_BUMP_MS, scoreBumpScale } from "./scoreBump";
import {
	AMBER,
	DIGIT_CELLS,
	DIGIT_DOTS,
	departed,
	digitCols,
	landed,
	SCORE_PITCH,
	shownScore,
	type Tally,
	type TallyCatch,
	tallyInCombo,
} from "./scoreTally";

/**
 * What the score meter draws in a frame (see scoreTally.ts): the total at the geometry's
 * centre, bumped by the newest landing, and every score sliver in the air, packed as dots and
 * then as sprites for two tinted drawAtlas calls. The buffers live on the thread that draws.
 */

/** The total's dot radius as a fraction of its spacing, as the HUD had it */
const SCORE_DOT_SCALE = 0.38;
/** A sliver's radius (px), and how much of it it has lost by the time it arrives */
export const SLIVER_RADIUS = 3;
const SLIVER_SHRINK = 0.4;
/** A sliver's bump, as a fraction of a catch's last */
const POINT_BUMP = 0.35;

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
 * The slivers in the air at `now`: each on its way from where its catch happened to where it
 * vanishes, at a steady pace, shrinking a little on the way
 */
function packSlivers(list: readonly TallyCatch[], now: number, out: number[]): void {
	"worklet";
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		const d = departed(c, now);
		for (let k = landed(c, now); k < d; k++) {
			const e = (now - (c.at + k * c.tick)) / c.flight;
			out.push(
				c.x + (c.toX - c.x) * e,
				c.y + (c.toY - c.y) * e,
				SLIVER_RADIUS * (1 - SLIVER_SHRINK * e),
				c.color,
				1,
			);
		}
	}
}

/** The total's scale at `now`: bumped by the newest landing, hard for a catch's last sliver */
function bumpScale(tally: Tally, now: number): number {
	"worklet";
	let bumpAt = tally.lastLand;
	let bumpFinal = true;
	for (let i = 0; i < tally.catches.length; i++) {
		const c = tally.catches[i];
		const n = landed(c, now);
		if (n === 0) continue;
		const at = c.at + (n - 1) * c.tick + c.flight;
		if (at > bumpAt) {
			bumpAt = at;
			bumpFinal = n === c.value;
		}
	}
	if (bumpAt === NOT_STARTED) return 1;
	const swell = scoreBumpScale((now - bumpAt) / SCORE_BUMP_MS) - 1;
	return 1 + swell * (bumpFinal ? 1 : POINT_BUMP);
}

/** Pack what the meter draws at `now` into `out`, the total centred where the tally stands */
export function packTally(tally: Tally, now: number, out: TallyFrame): void {
	"worklet";
	const { cx, cy } = tally.geometry;
	out.total.length = 0;
	out.dots.length = 0;
	const shown = shownScore(tally, now);
	out.shown = shown;
	out.combo = tallyInCombo(tally, now);
	const totalWidth = digitCols(shown) * SCORE_PITCH;
	layDigits(
		out.total,
		shown,
		SCORE_PITCH,
		cx - totalWidth / 2,
		cy,
		SCORE_PITCH * SCORE_DOT_SCALE,
		bumpScale(tally, now),
		cx,
		cy,
	);
	packSlivers(tally.catches, now, out.dots);
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
