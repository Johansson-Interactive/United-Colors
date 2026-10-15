import { FIELD, KIND_CODE, WALL_NORMAL_MIN } from "../application/sceneRecord";

/**
 * The free dots as sprites: every halo, and the body and glare of every plain small dot (one
 * in free flight, not stretched and not at a wall), packed for three drawAtlas calls in place
 * of about twelve Skia calls per dot. The sprites are white and drawn once into one image (see
 * sceneDrawer.ts); a halo or body takes its dot's colour from the colour it is drawn with.
 *
 * The glare's place on a dot follows the light, which is the same for every dot in a frame:
 * the sprite sheet holds the glare at GLARE_STEPS distances from the centre, and each glare is
 * turned to face the light. So the sheet is drawn once, however the phone tilts.
 *
 * This module is the geometry and the packing, with no Skia in it, so it can be tested; it
 * runs on the UI thread every frame, so it packs a whole scene per call, indexing the record
 * directly, and reuses its objects from frame to frame (see FIELD in sceneRecord.ts).
 */

/** Glare centre offset and radius relative to a unit-radius dot, when the device is level */
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
export const HALO_CELL = 2 * (HALO_PX + PAD_PX);
/** Glare distances in the sheet, evenly from the centre to GLARE_MAX_DISTANCE */
export const GLARE_STEPS = 48;
/** Farthest the glare gets from the centre: both axes at their limit */
export const GLARE_MAX_DISTANCE = Math.hypot(GLARE_MAX_OFFSET, GLARE_MAX_OFFSET);
/** Glare cells per row of the sheet */
const GLARE_COLUMNS = 8;

/** The sheet: the halo cell, the body cell beside it, then rows of glare cells below them */
export const SHEET_WIDTH = Math.max(HALO_CELL + BODY_CELL, GLARE_COLUMNS * BODY_CELL);
export const SHEET_HEIGHT = HALO_CELL + Math.ceil(GLARE_STEPS / GLARE_COLUMNS) * BODY_CELL;

/** A cell of the sheet, in the shape Skia reads as a rect */
export interface SheetCell {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const HALO_SPRITE: SheetCell = { x: 0, y: 0, width: HALO_CELL, height: HALO_CELL };
export const BODY_SPRITE: SheetCell = { x: HALO_CELL, y: 0, width: BODY_CELL, height: BODY_CELL };

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

/** A sprite's placement, in the shape Skia reads as an RSXform */
export interface SpritePlacement {
	scos: number;
	ssin: number;
	tx: number;
	ty: number;
}

/**
 * One drawAtlas call's sprites. drawAtlas takes whole arrays, so each count has its own
 * arrays, made the first time a frame has that many sprites and reused after; their entries
 * are rewritten in place each frame.
 */
export interface SpriteBatch {
	count: number;
	/** Placements, by count: placements[n] holds the first n of `pool` */
	placements: SpritePlacement[][];
	/** Colours by count, rewritten each frame (unused for glares) */
	colors: Float32Array[][];
	/** Cells by count, rewritten each frame */
	cells: SheetCell[][];
	pool: SpritePlacement[];
}

/** Everything the free dots' three drawAtlas calls draw in a frame */
export interface DotSprites {
	halos: SpriteBatch;
	bodies: SpriteBatch;
	glares: SpriteBatch;
	/** The glare cells, by step (see glareCell) */
	glareCells: SheetCell[];
}

function spriteBatch(): SpriteBatch {
	"worklet";
	return { count: 0, placements: [[]], colors: [[]], cells: [[]], pool: [] };
}

/** Fresh buffers to pack into, for one canvas on the thread that draws it */
export function dotSprites(): DotSprites {
	"worklet";
	const glareCells: SheetCell[] = [];
	for (let step = 0; step < GLARE_STEPS; step++) glareCells.push(glareCell(step));
	return { halos: spriteBatch(), bodies: spriteBatch(), glares: spriteBatch(), glareCells };
}

/**
 * Pack the frame's sprites into `out`: a halo for every dot but the player (a merging dot's
 * shrinking as it slides in), and a body and a glare for every plain small dot, the glare at
 * (`gx`, `gy`) unit radii from the centre (see glareOffset). `colors` are the body colours by
 * the scene's colour index. Afterwards each batch's `count` says how many it holds, and
 * placements[count], colors[count] and cells[count] are its arrays for drawAtlas.
 */
export function packDotSprites(
	dots: Float32Array,
	gx: number,
	gy: number,
	colors: readonly Float32Array[],
	out: DotSprites,
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
	const batches = [halos, bodies, glares];
	for (let b = 0; b < 3; b++) {
		const batch = batches[b];
		const n = b === 0 ? haloCount : plainCount;
		batch.count = n;
		while (batch.pool.length < n) batch.pool.push({ scos: 0, ssin: 0, tx: 0, ty: 0 });
		if (batch.placements[n] === undefined) {
			const placements: SpritePlacement[] = [];
			const cellsOfN: SheetCell[] = [];
			const colorsOfN: Float32Array[] = [];
			for (let i = 0; i < n; i++) {
				placements.push(batch.pool[i]);
				cellsOfN.push(HALO_SPRITE);
				colorsOfN.push(colors[0]);
			}
			batch.placements[n] = placements;
			batch.cells[n] = cellsOfN;
			batch.colors[n] = colorsOfN;
		}
	}

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
	const haloColors = halos.colors[haloCount];
	const bodyCells = bodies.cells[plainCount];
	const bodyColors = bodies.colors[plainCount];
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
		const color = colors[dots[o + COLOR]];
		const fade = kind === MERGING ? 1 - dots[o + MERGE] : 1;
		if (fade > 0) {
			// Scaled about the cell's centre, which lands on the dot's
			const s = (radius * HALO_SCALE * fade) / HALO_PX;
			const halo = halos.pool[h];
			halo.scos = s;
			halo.ssin = 0;
			halo.tx = x - s * half;
			halo.ty = y - s * half;
			haloCells[h] = HALO_SPRITE;
			haloColors[h] = color;
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
		const body = bodies.pool[p];
		body.scos = s;
		body.ssin = 0;
		body.tx = x - s * bodyHalf;
		body.ty = y - s * bodyHalf;
		bodyCells[p] = BODY_SPRITE;
		bodyColors[p] = color;
		// Turned about the cell's centre: (u, v) lands at (scos u - ssin v + tx, ssin u + scos v + ty)
		const c = s * turnCos;
		const sn = s * turnSin;
		const glare = glares.pool[p];
		glare.scos = c;
		glare.ssin = sn;
		glare.tx = x - (c - sn) * bodyHalf;
		glare.ty = y - (sn + c) * bodyHalf;
		glareCells[p] = glareCellNow;
		p++;
	}
}
