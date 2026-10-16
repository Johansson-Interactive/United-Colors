import { FIELD, KIND_CODE, WALL_NORMAL_MIN } from "../application/sceneRecord";
import { GAME_COLORS } from "../domain/constants";
import { GLOW_SCALE } from "./dotmatrix/layout";

/**
 * The free dots as sprites: every halo, and the body and glare of every plain small dot (one
 * in free flight, not stretched and not at a wall), packed for three drawAtlas calls in place
 * of about twelve Skia calls per dot. The sprites are drawn once into one image (see
 * sceneDrawer.ts): a halo and a body in each game colour, so the dots' calls pass no colours,
 * and white glares.
 *
 * The glare's place on a dot follows the light, which is the same for every dot in a frame:
 * the sprite sheet holds the glare at GLARE_STEPS distances from the centre, and each glare is
 * turned to face the light. So the sheet is drawn once, however the phone tilts.
 *
 * drawAtlas reads plain objects field by field, by name, which cost more than the rest of the
 * call put together; Skia's own rect and RSXform objects it reads directly. So the buffers hold
 * whatever a SpriteKit makes: Skia's objects on the UI thread, a cell's rect made once and a
 * placement rewritten in place with one call per sprite; plain objects in tests.
 *
 * This module is the geometry and the packing, with no Skia in it, so it can be tested; it
 * runs on the UI thread every frame, so it packs a whole scene per call, indexing the record
 * directly, and reuses its objects from frame to frame (see FIELD in sceneRecord.ts).
 */

const GLARE_OFFSET = -0.28;
export const GLARE_RADIUS = 0.75;
/** How far (unit radii per radian of tilt) the light slides across each dot */
const GLARE_TILT_GAIN = 0.45;
/** How far the glare may slide from the centre along each axis (unit radii) */
const GLARE_MAX_OFFSET = 0.55;
/** Halo (soft glow behind each non-player dot) size relative to its radius */
export const HALO_SCALE = 1.9;

/** Radius (px) of the body and glare sprites: a little above a small dot's on a phone */
export const BODY_PX = 48;
/** Radius (px) of the halo sprite */
export const HALO_PX = 96;
/** Clear pixels around each sprite, so filtering never reads a neighbour */
const PAD_PX = 2;
/** Side (px) of a body or glare cell, and of the halo cell */
export const BODY_CELL = 2 * (BODY_PX + PAD_PX);
const HALO_CELL = 2 * (HALO_PX + PAD_PX);
/** Glare distances in the sheet, evenly from the centre to GLARE_MAX_DISTANCE */
export const GLARE_STEPS = 48;
/** Farthest the glare gets from the centre: both axes at their limit */
export const GLARE_MAX_DISTANCE = Math.hypot(GLARE_MAX_OFFSET, GLARE_MAX_OFFSET);
/** Glare cells per row of the sheet */
const GLARE_COLUMNS = 8;

/**
 * Radius (px) of a score pop's dot sprite (see burstFrames.ts): a little above a pop dot at its
/** Halo and body cells: one of each per game colour, in GAME_COLORS order */
const DOT_COLORS = GAME_COLORS.length;

/**
 * Radius (px) of a score pop's dot sprite (see burstFrames.ts): a little above a pop dot at its
 * widest on a phone, so it is drawn smaller, never stretched. Its glow is DotMatrixText's.
 */
export const POP_DOT_PX = 8;
export const POP_GLOW_PX = POP_DOT_PX * GLOW_SCALE;
export const POP_DOT_CELL = 2 * (POP_DOT_PX + PAD_PX);
export const POP_GLOW_CELL = 2 * Math.ceil(POP_GLOW_PX + PAD_PX);

/**
 * The sheet: a halo cell per colour, a body cell per colour and the pop's glow and dot cells
 * beside them, then rows of glare cells below them
 */
export const SHEET_WIDTH = Math.max(
	DOT_COLORS * (HALO_CELL + BODY_CELL) + POP_GLOW_CELL + POP_DOT_CELL,
	GLARE_COLUMNS * BODY_CELL,
);
export const SHEET_HEIGHT = HALO_CELL + Math.ceil(GLARE_STEPS / GLARE_COLUMNS) * BODY_CELL;

/** A cell of the sheet */
export interface SheetCell {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The halo cells, by the scene's colour index */
export const HALO_SPRITES: readonly SheetCell[] = GAME_COLORS.map((_, i) => ({
	x: i * HALO_CELL,
	y: 0,
	width: HALO_CELL,
	height: HALO_CELL,
}));
/** The body cells, by the scene's colour index */
export const BODY_SPRITES: readonly SheetCell[] = GAME_COLORS.map((_, i) => ({
	x: DOT_COLORS * HALO_CELL + i * BODY_CELL,
	y: 0,
	width: BODY_CELL,
	height: BODY_CELL,
}));
const POP_X = DOT_COLORS * (HALO_CELL + BODY_CELL);
export const POP_GLOW_SPRITE: SheetCell = {
	x: POP_X,
	y: 0,
	width: POP_GLOW_CELL,
	height: POP_GLOW_CELL,
};
export const POP_DOT_SPRITE: SheetCell = {
	x: POP_X + POP_GLOW_CELL,
	y: 0,
	width: POP_DOT_CELL,
	height: POP_DOT_CELL,
};

/** The cell holding the glare `step` steps from the centre (0..GLARE_STEPS - 1) */
export function glareCell(step: number): SheetCell {
	"worklet";
	return {
		x: (step % GLARE_COLUMNS) * BODY_CELL,
		y: HALO_CELL + Math.floor(step / GLARE_COLUMNS) * BODY_CELL,
		width: BODY_CELL,
		height: BODY_CELL,
	};
}

/** How far from the centre (unit radii) the glare in step `step`'s cell sits */
export function glareStepDistance(step: number): number {
	return (GLARE_MAX_DISTANCE * step) / (GLARE_STEPS - 1);
}

/** Where the glare sits on a unit dot along one axis, for a light tilted by `light` radians */
export function glareOffset(light: number): number {
	"worklet";
	return Math.max(
		-GLARE_MAX_OFFSET,
		Math.min(GLARE_MAX_OFFSET, GLARE_OFFSET - light * GLARE_TILT_GAIN),
	);
}

/** A sprite's placement as an RSXform's fields (the plain stand-in tests read) */
export interface SpritePlacement {
	scos: number;
	ssin: number;
	tx: number;
	ty: number;
}

/** Rewrites one placement: an RSXform's `set`, or a plain placement's fields */
type Place = (scos: number, ssin: number, tx: number, ty: number) => void;

/**
 * Where the buffers get what drawAtlas reads: a placement `P` with the function that rewrites
 * it, and the rect `R` for a sheet cell, asked for once per cell
 */
export interface SpriteKit<P, R> {
	placement(): { placement: P; place: Place };
	rect(cell: SheetCell): R;
}

/** The kit of plain objects: a placement is its fields, a cell is its own rect */
export function plainKit(): SpriteKit<SpritePlacement, SheetCell> {
	"worklet";
	return {
		placement: () => {
			const placement = { scos: 0, ssin: 0, tx: 0, ty: 0 };
			const place: Place = (scos, ssin, tx, ty) => {
				placement.scos = scos;
				placement.ssin = ssin;
				placement.tx = tx;
				placement.ty = ty;
			};
			return { placement, place };
		},
		rect: (cell) => cell,
	};
}

/**
 * One drawAtlas call's sprites. drawAtlas takes whole arrays, so each count has its own
 * arrays, made the first time a frame has that many sprites and reused after; their entries
 * are rewritten in place each frame.
 */
export interface SpriteBatch<P, R> {
	count: number;
	/** Placements, by count: placements[n] holds the first n of `pool` */
	placements: P[][];
	/** Colours by count, rewritten each frame; only for a batch drawn tinted */
	colors: Float32Array[][];
	/** Cells by count, rewritten each frame */
	cells: R[][];
	pool: P[];
	/** What rewrites each of `pool`, by index */
	place: Place[];
	kit: SpriteKit<P, R>;
}

/** Everything the free dots' three drawAtlas calls draw in a frame */
export interface DotSprites<P, R> {
	halos: SpriteBatch<P, R>;
	bodies: SpriteBatch<P, R>;
	glares: SpriteBatch<P, R>;
	/** The halo and body cells, by colour index (see HALO_SPRITES, BODY_SPRITES) */
	haloCells: R[];
	bodyCells: R[];
	/** The glare cells, by step (see glareCell) */
	glareCells: R[];
}

export function spriteBatch<P, R>(kit: SpriteKit<P, R>): SpriteBatch<P, R> {
	"worklet";
	return { count: 0, placements: [[]], colors: [[]], cells: [[]], pool: [], place: [], kit };
}

/**
 * Make `batch` hold `n` sprites this frame: its count, and its arrays for `n` the first time a
 * frame has that many, filled with `cell` (and `color`, for a tinted batch) until the packing
 * writes them
 */
export function fitBatch<P, R>(batch: SpriteBatch<P, R>, n: number, cell: R, color?: Float32Array) {
	"worklet";
	batch.count = n;
	while (batch.pool.length < n) {
		const made = batch.kit.placement();
		batch.pool.push(made.placement);
		batch.place.push(made.place);
	}
	if (batch.placements[n] !== undefined) return;
	const placements: P[] = [];
	const cellsOfN: R[] = [];
	const colorsOfN: Float32Array[] = [];
	for (let i = 0; i < n; i++) {
		placements.push(batch.pool[i]);
		cellsOfN.push(cell);
		if (color !== undefined) colorsOfN.push(color);
	}
	batch.placements[n] = placements;
	batch.cells[n] = cellsOfN;
	batch.colors[n] = colorsOfN;
}

/** Fresh buffers to pack into, for one canvas on the thread that draws it */
export function dotSprites<P, R>(kit: SpriteKit<P, R>): DotSprites<P, R> {
	"worklet";
	const glareCells: R[] = [];
	for (let step = 0; step < GLARE_STEPS; step++) glareCells.push(kit.rect(glareCell(step)));
	return {
		halos: spriteBatch(kit),
		bodies: spriteBatch(kit),
		glares: spriteBatch(kit),
		haloCells: HALO_SPRITES.map((cell) => kit.rect(cell)),
		bodyCells: BODY_SPRITES.map((cell) => kit.rect(cell)),
		glareCells,
	};
}

/**
 * Pack the frame's sprites into `out`: a halo for every dot but the player (a merging dot's
 * shrinking as it slides in), and a body and a glare for every plain small dot, the glare at
 * (`gx`, `gy`) unit radii from the centre (see glareOffset). Halos and bodies come from the
 * cells in their dot's colour. Afterwards each batch's `count` says how many it holds, and
 * placements[count] and cells[count] are its arrays for drawAtlas.
 */
export function packDotSprites<P, R>(
	dots: Float32Array,
	gx: number,
	gy: number,
	out: DotSprites<P, R>,
): void {
	"worklet";
	const { X, Y, RADIUS, COLOR, KIND, MERGE, STRETCH_X, STRETCH_Y, WALL_X, WALL_Y, STRIDE } = FIELD;
	const SMALL = KIND_CODE.small;
	const PLAYER = KIND_CODE.player;
	const MERGING = KIND_CODE.merging;
	const count = Math.floor(dots.length / STRIDE);
	const { halos, bodies, glares } = out;

	// Count first, so each batch's arrays for this frame's counts exist before they are filled
	let haloCount = 0;
	let plainCount = 0;
	for (let i = 0; i < count; i++) {
		const o = i * STRIDE;
		const radius = dots[o + RADIUS];
		const kind = dots[o + KIND];
		if (radius <= 0 || kind === PLAYER) continue;
		if (kind !== MERGING || dots[o + MERGE] < 1) haloCount++;
		if (
			kind === SMALL &&
			Math.abs(dots[o + WALL_X]) + Math.abs(dots[o + WALL_Y]) < WALL_NORMAL_MIN &&
			dots[o + STRETCH_X] === 0 &&
			dots[o + STRETCH_Y] === 0
		) {
			plainCount++;
		}
	}
	fitBatch(halos, haloCount, out.haloCells[0]);
	fitBatch(bodies, plainCount, out.bodyCells[0]);
	fitBatch(glares, plainCount, out.glareCells[0]);

	// The glare faces the light: the cell at its distance, turned toward it
	const distance = Math.hypot(gx, gy);
	const step = Math.min(
		GLARE_STEPS - 1,
		Math.round((distance / GLARE_MAX_DISTANCE) * (GLARE_STEPS - 1)),
	);
	const turnCos = distance > 0 ? gx / distance : 1;
	const turnSin = distance > 0 ? gy / distance : 0;
	const glareCellNow = out.glareCells[step];

	const haloCells = halos.cells[haloCount];
	const bodyCells = bodies.cells[plainCount];
	const glareCells = glares.cells[plainCount];
	const half = HALO_CELL / 2;
	const bodyHalf = BODY_CELL / 2;
	let h = 0;
	let p = 0;
	for (let i = 0; i < count; i++) {
		const o = i * STRIDE;
		const radius = dots[o + RADIUS];
		const kind = dots[o + KIND];
		if (radius <= 0 || kind === PLAYER) continue;
		const x = dots[o + X];
		const y = dots[o + Y];
		const color = dots[o + COLOR];
		const fade = kind === MERGING ? 1 - dots[o + MERGE] : 1;
		if (fade > 0) {
			// Scaled about the cell's centre, which lands on the dot's
			const s = (radius * HALO_SCALE * fade) / HALO_PX;
			halos.place[h](s, 0, x - s * half, y - s * half);
			haloCells[h] = out.haloCells[color];
			h++;
		}
		if (
			kind !== SMALL ||
			Math.abs(dots[o + WALL_X]) + Math.abs(dots[o + WALL_Y]) >= WALL_NORMAL_MIN ||
			dots[o + STRETCH_X] !== 0 ||
			dots[o + STRETCH_Y] !== 0
		) {
			continue;
		}
		const s = radius / BODY_PX;
		bodies.place[p](s, 0, x - s * bodyHalf, y - s * bodyHalf);
		bodyCells[p] = out.bodyCells[color];
		// Turned about the cell's centre: (u, v) lands at (scos u - ssin v + tx, ssin u + scos v + ty)
		const c = s * turnCos;
		const sn = s * turnSin;
		glares.place[p](c, sn, x - (c - sn) * bodyHalf, y - (sn + c) * bodyHalf);
		glareCells[p] = glareCellNow;
		p++;
	}
}
