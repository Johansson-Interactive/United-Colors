import { GAME_COLORS } from "../../domain/constants";
import { layoutDotMatrix, matrixBox } from "../dotmatrix/layout";
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
import { COMBO_AMBER, WHITE } from "../theme/theme";

/**
 * Short-lived feedback drawn at a point in the playfield, in the game canvas: a score pop that
 * floats up (a combo's total is one too, larger and held longer), or a ring that expands from
 * where something happened (a point catch, the final hit). They were views once; their curves
 * are those views' animations, and a pop's dots land where the view's DotMatrixText put them.
 *
 * The list of bursts lives on the UI thread. The JS thread lays each one out once (see
 * popBurst) and appends it with withBurst; the UI thread stamps it with the frame time on its
 * first frame, drops it when its lifetime is up (advanceBursts) and packs every frame's
 * sprites and rings for drawing (packBursts). Packing runs every frame a burst is alive, so it
 * indexes directly, calls nothing per dot and reuses its objects from frame to frame.
 */

/** How long a burst lasts (ms) */
export const BURST_LIFETIME_MS = 900;
/** How long a combo total's pop lasts (ms), and how much larger it is drawn than a catch's */
export const TOTAL_LIFETIME_MS = 1300;
export const TOTAL_SCALE = 1.6;
/** Bursts alive at once; a new one past this drops the oldest */
export const MAX_BURSTS = 8;
/** A ring's diameter (px) before it grows, unless the burst gives its own */
const RING_SIZE = 60;
/** A pop's text: the dot spacing (px) and the dot radius as a fraction of it, as DotMatrixText */
export const POP_PITCH = 5;
export const POP_DOT_SCALE = 0.38;
/** How far above the catch (px) the pop's box starts, and how far it rises */
const POP_DROP = 30;
const POP_RISE = 46;

/** A burst's colour, by index: the game's colours, the combo's amber, then white */
export const BURST_COLORS: readonly string[] = [...GAME_COLORS, COMBO_AMBER, WHITE];

/** The index of a colour in BURST_COLORS; white for any other */
export function burstColor(color: string): number {
	const index = BURST_COLORS.indexOf(color);
	return index < 0 ? BURST_COLORS.indexOf(WHITE) : index;
}

/** A burst's start before its first frame */
export const NOT_STARTED = -1;

/** One burst, as plain numbers; every burst has every field, so the UI thread sees one shape */
export interface Burst {
	id: number;
	kind: "pop" | "total" | "ring";
	/** Where it happened */
	x: number;
	y: number;
	/** Index into BURST_COLORS */
	color: number;
	/** A ring's diameter before it grows (0 for a pop) */
	size: number;
	/** A pop's dots as (dx, dy) pairs: px from the text's centre at scale 1 (empty for a ring) */
	dots: number[];
	/** How far below the catch a pop's text centre starts (0 for a ring) */
	centreY: number;
	/** The UI frame time it first drew at, or NOT_STARTED */
	start: number;
}

/**
 * A score pop of `text` caught at (x, y). The old view was a box 120 px wide with its top-left
 * at (x - 60, y - 30 - rise), the text's padded canvas (see matrixBox) centred in
 * it, scaled about the box's centre. The box and the text share a centre, so each dot sits at
 * its offset from the text's centre, times the scale, from a centre that starts half the
 * canvas's height below the box's top.
 */
export function popBurst(id: number, x: number, y: number, text: string, color: number): Burst {
	const layout = layoutDotMatrix(text);
	const { width, height, pad } = matrixBox(layout, POP_PITCH, true, false);
	const dots: number[] = [];
	for (const dot of layout.dots) {
		dots.push(
			pad + (dot.col + 0.5) * POP_PITCH - width / 2,
			pad + (dot.row + 0.5) * POP_PITCH - height / 2,
		);
	}
	return {
		id,
		kind: "pop",
		x,
		y,
		color,
		size: 0,
		dots,
		centreY: height / 2 - POP_DROP,
		start: NOT_STARTED,
	};
}

/** A combo total's pop of `text`, from where the combo's last catch landed */
export function totalBurst(id: number, x: number, y: number, text: string, color: number): Burst {
	return { ...popBurst(id, x, y, text, color), kind: "total" };
}

/** A ring from (x, y), `size` across before it grows */
export function ringBurst(
	id: number,
	x: number,
	y: number,
	color: number,
	size: number = RING_SIZE,
): Burst {
	return { id, kind: "ring", x, y, color, size, dots: [], centreY: 0, start: NOT_STARTED };
}

/** `list` with `burst` added at the end, dropping the oldest past MAX_BURSTS */
export function withBurst(list: readonly Burst[], burst: Burst): Burst[] {
	"worklet";
	const next: Burst[] = [];
	for (let i = Math.max(0, list.length - (MAX_BURSTS - 1)); i < list.length; i++) {
		next.push(list[i]);
	}
	// A copy made here, so the thread that stamps it owns it
	next.push({
		id: burst.id,
		kind: burst.kind,
		x: burst.x,
		y: burst.y,
		color: burst.color,
		size: burst.size,
		dots: burst.dots,
		centreY: burst.centreY,
		start: burst.start,
	});
	return next;
}

/** Hands out burst ids on the JS thread, and judges the UI thread's requests to stop the clock */
export interface BurstIds {
	/** The next burst's id: 0, then 1, and so on */
	take(): number;
	/**
	 * Whether `seen`, the newest burst the UI thread had drawn when its list ran empty, is the
	 * newest taken. A stop sent before a newer burst reached the UI thread is for an older one,
	 * and stopping then would leave the newer burst undrawn past its first frame.
	 */
	isNewest(seen: number): boolean;
}

/**
 * Burst ids, kept outside the hook: the React Compiler turns `ref.current++` in a hook into a
 * pre-increment, which once made every stop for the burst before the newest look current
 */
export function createBurstIds(): BurstIds {
	let next = 0;
	return {
		take() {
			const id = next;
			next = id + 1;
			return id;
		},
		isNewest(seen) {
			return seen === next - 1;
		},
	};
}

/** How long `burst` lasts (ms) */
function lifetime(burst: Burst): number {
	"worklet";
	return burst.kind === "total" ? TOTAL_LIFETIME_MS : BURST_LIFETIME_MS;
}

/**
 * Advance the list to frame time `now`: a burst not yet drawn starts now (stamped in place),
 * and one whose lifetime is up is dropped. Returns `list` itself unless one was dropped.
 */
export function advanceBursts(list: Burst[], now: number): Burst[] {
	"worklet";
	let expired = 0;
	for (let i = 0; i < list.length; i++) {
		const burst = list[i];
		if (burst.start === NOT_STARTED) burst.start = now;
		else if (now - burst.start >= lifetime(burst)) expired++;
	}
	if (expired === 0) return list;
	const next: Burst[] = [];
	for (let i = 0; i < list.length; i++) {
		if (now - list[i].start < lifetime(list[i])) next.push(list[i]);
	}
	return next;
}

// The curves, by progress `t` (0..1, eased) through a burst. The easings are Reanimated's
// Easing.out(cubic) and Easing.out(quad) over linear time, written out.

/** A pop's progress `age` ms into its `duration`: out-cubic */
export function popProgress(age: number, duration: number = BURST_LIFETIME_MS): number {
	"worklet";
	const left = 1 - Math.min(1, Math.max(0, age / duration));
	return 1 - left * left * left;
}

/** A pop's opacity: whole for the first 60 %, then fading out */
export function popOpacity(t: number): number {
	"worklet";
	return t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
}

/** A pop's scale about its centre: swelling from 0.7 to 1.2 over the first quarter */
export function popScale(t: number): number {
	"worklet";
	return 0.7 + Math.min(t * 4, 1) * 0.5;
}

/** How far (px) a pop has risen */
export function popRise(t: number): number {
	"worklet";
	return t * POP_RISE;
}

/** A ring's progress `age` ms in: out-quad */
export function ringProgress(age: number): number {
	"worklet";
	const left = 1 - Math.min(1, Math.max(0, age / BURST_LIFETIME_MS));
	return 1 - left * left;
}

/** A ring's opacity */
export function ringOpacity(t: number): number {
	"worklet";
	return (1 - t) * 0.9;
}

/** A ring's border width (px) before it is scaled */
export function ringBorder(t: number): number {
	"worklet";
	return 3 + (1 - t) * 5;
}

/** A ring's scale about where it happened */
export function ringScale(t: number): number {
	"worklet";
	return 0.3 + t * 9;
}

/** A ring to stroke: its centre, the radius of the stroke's middle, its width and its alpha */
interface BurstRing {
	x: number;
	y: number;
	radius: number;
	width: number;
	alpha: number;
	/** Index into BURST_COLORS */
	color: number;
}

/** Everything the bursts draw in a frame, reused from frame to frame */
export interface BurstSprites<P, R> {
	/** Every pop dot's glow, then every pop dot, tinted by its pop's colour and opacity */
	glows: SpriteBatch<P, R>;
	dots: SpriteBatch<P, R>;
	/** The glow and dot cells (see POP_GLOW_SPRITE, POP_DOT_SPRITE) */
	glowCell: R;
	dotCell: R;
	/** One tint per pop drawn, rewritten each frame */
	tints: Float32Array[];
	rings: BurstRing[];
	ringCount: number;
}

/** Fresh buffers to pack into, for the thread that draws the bursts (see SpriteKit) */
export function burstSprites<P, R>(kit: SpriteKit<P, R>): BurstSprites<P, R> {
	"worklet";
	const tints: Float32Array[] = [];
	const rings: BurstRing[] = [];
	for (let i = 0; i < MAX_BURSTS; i++) {
		tints.push(new Float32Array(4));
		rings.push({ x: 0, y: 0, radius: 0, width: 0, alpha: 0, color: 0 });
	}
	return {
		glows: spriteBatch(kit),
		dots: spriteBatch(kit),
		glowCell: kit.rect(POP_GLOW_SPRITE),
		dotCell: kit.rect(POP_DOT_SPRITE),
		tints,
		rings,
		ringCount: 0,
	};
}

/**
 * Pack the bursts at frame time `now` into `out`: each pop's dots as glow and dot sprites (see
 * dotSprites.ts), and each ring as a circle to stroke. `colors` are BURST_COLORS as Skia
 * colours. A burst not yet stamped draws as at its start; one past its lifetime not at all.
 */
export function packBursts<P, R>(
	list: readonly Burst[],
	now: number,
	colors: readonly Float32Array[],
	out: BurstSprites<P, R>,
): void {
	"worklet";
	let dotCount = 0;
	for (let i = 0; i < list.length; i++) {
		const burst = list[i];
		const age = burst.start === NOT_STARTED ? 0 : now - burst.start;
		if (burst.kind !== "ring" && age < lifetime(burst)) dotCount += burst.dots.length / 2;
	}
	const { glows, dots, tints, rings } = out;
	fitBatch(glows, dotCount, out.glowCell, colors[0]);
	fitBatch(dots, dotCount, out.dotCell, colors[0]);
	const glowCells = glows.cells[dotCount];
	const glowColors = glows.colors[dotCount];
	const dotCells = dots.cells[dotCount];
	const dotColors = dots.colors[dotCount];
	const glowHalf = POP_GLOW_CELL / 2;
	const dotHalf = POP_DOT_CELL / 2;
	let d = 0;
	let pops = 0;
	let ringCount = 0;
	for (let i = 0; i < list.length; i++) {
		const burst = list[i];
		const age = burst.start === NOT_STARTED ? 0 : now - burst.start;
		const span = lifetime(burst);
		if (age >= span) continue;
		if (burst.kind === "ring") {
			const t = ringProgress(age);
			const scale = ringScale(t);
			const border = ringBorder(t);
			// The view's border lay inside its circle; the stroke is centred on its middle
			const ring = rings[ringCount++];
			ring.x = burst.x;
			ring.y = burst.y;
			ring.radius = (scale * (burst.size - border)) / 2;
			ring.width = scale * border;
			ring.alpha = ringOpacity(t);
			ring.color = burst.color;
			continue;
		}
		const t = popProgress(age, span);
		const scale = burst.kind === "total" ? popScale(t) * TOTAL_SCALE : popScale(t);
		const color = colors[burst.color];
		const tint = tints[pops++];
		tint[0] = color[0];
		tint[1] = color[1];
		tint[2] = color[2];
		tint[3] = color[3] * popOpacity(t);
		const cx = burst.x;
		const cy = burst.y + burst.centreY - popRise(t);
		// Both cells scale about their centres, which land on the dot's; the glow cell is the
		// dot cell's glow, so one scale sizes both
		const s = (POP_PITCH * POP_DOT_SCALE * scale) / POP_DOT_PX;
		const offsets = burst.dots;
		for (let k = 0; k < offsets.length; k += 2) {
			const x = cx + scale * offsets[k];
			const y = cy + scale * offsets[k + 1];
			glows.place[d](s, 0, x - s * glowHalf, y - s * glowHalf);
			glowCells[d] = out.glowCell;
			glowColors[d] = tint;
			dots.place[d](s, 0, x - s * dotHalf, y - s * dotHalf);
			dotCells[d] = out.dotCell;
			dotColors[d] = tint;
			d++;
		}
	}
	out.ringCount = ringCount;
}
