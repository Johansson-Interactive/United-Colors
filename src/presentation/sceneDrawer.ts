import {
	BlendMode,
	PaintStyle,
	type SkCanvas,
	type SkColor,
	type SkImage,
	Skia,
	type SkRect,
	type SkRSXform,
	type SkRuntimeEffect,
	TileMode,
	vec,
} from "@shopify/react-native-skia";
import { YOLK_RADIUS } from "../application/renderScene";
import {
	dotCount,
	FIELD,
	findPlayer,
	KIND_CODE,
	readDot,
	type SceneDot,
	sceneDot,
	WALL_NORMAL_MIN,
} from "../application/sceneRecord";
import { GAME_COLORS } from "../domain/constants";
import { GLOW_CORE_ALPHA } from "./dotmatrix/layout";
import {
	BODY_CELL,
	BODY_PX,
	BODY_SPRITES,
	type DotSprites,
	dotSprites,
	GLARE_RADIUS,
	GLARE_STEPS,
	glareCell,
	glareOffset,
	glareStepDistance,
	HALO_PX,
	HALO_SPRITES,
	POP_DOT_PX,
	POP_DOT_SPRITE,
	POP_GLOW_PX,
	POP_GLOW_SPRITE,
	packDotSprites,
	SHEET_HEIGHT,
	SHEET_WIDTH,
	type SpriteBatch,
	type SpriteKit,
} from "./dotSprites";
import {
	BURST_COLORS,
	type Burst,
	type BurstSprites,
	burstSprites,
	packBursts,
} from "./effects/burstFrames";
import type { Tally } from "./effects/scoreTally";
import {
	packTally,
	packTallySprites,
	type TallyFrame,
	type TallySprites,
	tallyFrame,
	tallySprites,
} from "./effects/tallyPack";
import {
	MERGE_PACKED_LENGTH,
	MERGE_SKSL,
	type MergeUniformsByName,
	mergeUniformsByName,
	NO_AMBER,
	packMergeUniforms,
} from "./mergeShader";
import { glass } from "./theme/theme";
import {
	packWallDropUniforms,
	WALL_DROP_SKSL,
	WALL_DROP_SLOTS,
	type WallDropSlot,
	wallDropSlots,
} from "./wallDropShader";

// Paints and colours are built once on the JS thread and captured by the drawing worklet,
// so a frame only sets the fill colour and draws.

/** Body colours, indexed by the scene's colour index (GAME_COLORS order) */
const FILL_COLORS = GAME_COLORS.map((color) => Skia.Color(color));

const FILL_PAINT = Skia.Paint();
FILL_PAINT.setAntiAlias(true);

/**
 * Specular glare centred on the origin in unit-radius space. Instead of moving the shader
 * with the light, the canvas is shifted so the origin sits at the glare centre and the dot
 * is drawn offset by the opposite amount.
 */
const GLARE_PAINT = Skia.Paint();
GLARE_PAINT.setAntiAlias(true);
GLARE_PAINT.setShader(
	Skia.Shader.MakeRadialGradient(
		vec(0, 0),
		GLARE_RADIUS,
		[Skia.Color(glass(0.55)), Skia.Color(glass(0))],
		null,
		TileMode.Clamp,
	),
);

/**
 * The glare on a dot at (x, y) of `radius`, turned toward the light by the offsets glareOffset
 * gives (`gx`, `gy`), as the scene draws it on every dot
 */
export function drawGlareAt(
	canvas: SkCanvas,
	x: number,
	y: number,
	radius: number,
	gx: number,
	gy: number,
) {
	"worklet";
	canvas.save();
	canvas.translate(x + gx * radius, y + gy * radius);
	canvas.scale(radius, radius);
	canvas.drawCircle(-gx, -gy, 1, GLARE_PAINT);
	canvas.restore();
}

export function compileEffect(name: string, sksl: string): SkRuntimeEffect {
	const effect = Skia.RuntimeEffect.Make(sksl);
	if (!effect) throw new Error(`${name} shader failed to compile`);
	return effect;
}

/**
 * The player and the dots merging into it, drawn as one liquid body by the metaball shader
 * (see mergeShader.ts). Compiled once; the canvas draws it between the two layers of the
 * scene from liquidBody's uniforms (see GameCanvas.tsx).
 */
export const MERGE_EFFECT = compileEffect("merge", MERGE_SKSL);

/**
 * A small dot at a wall (see wallDropShader.ts), the same way: the canvas draws the first
 * WALL_DROP_SLOTS of them from wallDrops' uniforms, and drawScene any past those
 */
export const WALL_DROP_EFFECT = compileEffect("wall drop", WALL_DROP_SKSL);
const WALL_DROP_PAINT = Skia.Paint();
WALL_DROP_PAINT.setAntiAlias(true);

/**
 * The sprite sheet the free dots are drawn from (see dotSprites.ts): the halo and the body in
 * each game colour, the pop's glow and dot and the glare at each of its distances from the
 * centre in white. Drawn once, into a raster image any thread can draw. A coloured cell is
 * what a white one tinted with Modulate gave: the colour, at the white's alpha.
 */
const SPRITE_SHEET: SkImage = (() => {
	const surface = Skia.Surface.Make(SHEET_WIDTH, SHEET_HEIGHT);
	if (!surface) throw new Error("sprite sheet surface failed");
	const canvas = surface.getCanvas();
	const tinted = (color: Float32Array, alpha: number) =>
		Float32Array.of(color[0], color[1], color[2], color[3] * alpha);
	const white = (alpha: number) => Float32Array.of(1, 1, 1, alpha);
	const body = Skia.Paint();
	body.setAntiAlias(true);
	FILL_COLORS.forEach((color, i) => {
		const haloCell = HALO_SPRITES[i];
		const hx = haloCell.x + haloCell.width / 2;
		const hy = haloCell.y + haloCell.height / 2;
		const halo = Skia.Paint();
		halo.setAntiAlias(true);
		halo.setShader(
			Skia.Shader.MakeRadialGradient(
				vec(hx, hy),
				HALO_PX,
				[tinted(color, 0.5), tinted(color, 0.16), tinted(color, 0)],
				[0.3, 0.6, 1],
				TileMode.Clamp,
			),
		);
		canvas.drawCircle(hx, hy, HALO_PX, halo);
		const bodyCell = BODY_SPRITES[i];
		body.setColor(color);
		canvas.drawCircle(
			bodyCell.x + bodyCell.width / 2,
			bodyCell.y + bodyCell.height / 2,
			BODY_PX,
			body,
		);
	});
	body.setColor(white(1));
	// A score pop's dot and its glow, as DotMatrixText draws them (see burstFrames.ts)
	const popGlowX = POP_GLOW_SPRITE.x + POP_GLOW_SPRITE.width / 2;
	const popGlowY = POP_GLOW_SPRITE.y + POP_GLOW_SPRITE.height / 2;
	const popGlow = Skia.Paint();
	popGlow.setAntiAlias(true);
	popGlow.setShader(
		Skia.Shader.MakeRadialGradient(
			vec(popGlowX, popGlowY),
			POP_GLOW_PX,
			[white(GLOW_CORE_ALPHA), white(0)],
			null,
			TileMode.Clamp,
		),
	);
	canvas.drawCircle(popGlowX, popGlowY, POP_GLOW_PX, popGlow);
	canvas.drawCircle(
		POP_DOT_SPRITE.x + POP_DOT_SPRITE.width / 2,
		POP_DOT_SPRITE.y + POP_DOT_SPRITE.height / 2,
		POP_DOT_PX,
		body,
	);
	// Each glare lies to the right of its cell's centre; drawing turns it toward the light
	for (let step = 0; step < GLARE_STEPS; step++) {
		const cell = glareCell(step);
		const cx = cell.x + BODY_CELL / 2;
		const cy = cell.y + BODY_CELL / 2;
		const glare = Skia.Paint();
		glare.setAntiAlias(true);
		glare.setShader(
			Skia.Shader.MakeRadialGradient(
				vec(cx + glareStepDistance(step) * BODY_PX, cy),
				GLARE_RADIUS * BODY_PX,
				[white(0.55), white(0)],
				null,
				TileMode.Clamp,
			),
		);
		canvas.drawCircle(cx, cy, BODY_PX, glare);
	}
	surface.flush();
	return surface.makeImageSnapshot();
})();

const ATLAS_PAINT = Skia.Paint();

/**
 * Skia's own rects and RSXforms, which drawAtlas reads directly, where it reads a plain object
 * field by field by name: a cell's rect made once, a placement made once and rewritten through
 * its `set`, kept so each sprite costs one call (see SpriteKit)
 */
function skiaKit(): SpriteKit<SkRSXform, SkRect> {
	"worklet";
	return {
		placement: () => {
			const placement = Skia.RSXform(0, 0, 0, 0);
			return { placement, place: placement.set };
		},
		rect: (cell) => Skia.XYWHRect(cell.x, cell.y, cell.width, cell.height),
	};
}

/** The sprite buffers for the thread drawing the scene, made there on its first frame */
function spriteBuffers(): DotSprites<SkRSXform, SkRect> {
	"worklet";
	const g = globalThis as { __tiltlingDotSprites?: DotSprites<SkRSXform, SkRect> };
	if (g.__tiltlingDotSprites === undefined) g.__tiltlingDotSprites = dotSprites(skiaKit());
	return g.__tiltlingDotSprites;
}

/** Draw a batch of sprites from the sheet, each tinted by its colour if `tinted` */
function drawSprites(canvas: SkCanvas, batch: SpriteBatch<SkRSXform, SkRect>, tinted: boolean) {
	"worklet";
	const n = batch.count;
	if (n === 0) return;
	// Colours are read by index from each entry, so a reused Float32Array serves. Skia only
	// reads the blend mode when a sixth argument is passed, so `undefined` stands for no colours
	canvas.drawAtlas(
		SPRITE_SHEET,
		batch.cells[n],
		batch.placements[n],
		ATLAS_PAINT,
		BlendMode.Modulate,
		tinted ? (batch.colors[n] as SkColor[]) : undefined,
	);
}

/** Burst colours, indexed as BURST_COLORS */
const BURST_FILLS = BURST_COLORS.map((color) => Skia.Color(color));

const RING_PAINT = Skia.Paint();
RING_PAINT.setAntiAlias(true);
RING_PAINT.setStyle(PaintStyle.Stroke);

/** The burst buffers for the thread drawing the bursts, made there on its first frame */
function burstBuffers(): BurstSprites<SkRSXform, SkRect> {
	"worklet";
	const g = globalThis as { __tiltlingBurstSprites?: BurstSprites<SkRSXform, SkRect> };
	if (g.__tiltlingBurstSprites === undefined) g.__tiltlingBurstSprites = burstSprites(skiaKit());
	return g.__tiltlingBurstSprites;
}

/**
 * Draw the bursts (see burstFrames.ts) at frame time `now`: every pop dot's glow, then every
 * pop dot, as sprites, then the rings
 */
export function drawBursts(canvas: SkCanvas, bursts: readonly Burst[], now: number) {
	"worklet";
	if (bursts.length === 0) return;
	const out = burstBuffers();
	packBursts(bursts, now, BURST_FILLS, out);
	drawSprites(canvas, out.glows, true);
	drawSprites(canvas, out.dots, true);
	for (let i = 0; i < out.ringCount; i++) {
		const ring = out.rings[i];
		RING_PAINT.setColor(BURST_FILLS[ring.color]);
		RING_PAINT.setAlphaf(ring.alpha);
		RING_PAINT.setStrokeWidth(ring.width);
		canvas.drawCircle(ring.x, ring.y, ring.radius, RING_PAINT);
	}
}

/** The meter's buffers for the thread drawing it, made there on its first frame */
function tallyBuffers(): { frame: TallyFrame; sprites: TallySprites<SkRSXform, SkRect> } {
	"worklet";
	const g = globalThis as {
		__tiltlingTally?: { frame: TallyFrame; sprites: TallySprites<SkRSXform, SkRect> };
	};
	if (g.__tiltlingTally === undefined) {
		g.__tiltlingTally = { frame: tallyFrame(), sprites: tallySprites(skiaKit()) };
	}
	return g.__tiltlingTally;
}

/**
 * Draw the score meter (see tallyPack.ts) at lane time `now`: every dot's glow, then every
 * dot, as sprites, the total in `scoreColor`
 */
export function drawTally(canvas: SkCanvas, tally: Tally, now: number, scoreColor: Float32Array) {
	"worklet";
	const { frame, sprites } = tallyBuffers();
	packTally(tally, now, frame);
	packTallySprites(frame, BURST_FILLS, scoreColor, sprites);
	drawSprites(canvas, sprites.glows, true);
	drawSprites(canvas, sprites.dots, true);
}

/**
 * The scene is drawn in layers around the shader nodes the canvas draws: below the wall drops
 * (see wallDrops), the wall drops' glare, then above the liquid body (see liquidBody)
 */
export type SceneLayer = "below" | "drops" | "above";

/** The liquid body to draw between the layers: where, and the merge shader's uniforms */
export interface LiquidBody {
	x: number;
	y: number;
	width: number;
	height: number;
	uniforms: MergeUniformsByName;
}

/** No body (no player, as on the title): an empty rect, with uniforms the shader still accepts */
const NO_BODY_COLOR = [0, 0, 0, 0];

/**
 * The player and whatever is merging into it, as one liquid body, for the canvas to draw with
 * the merge shader between the scene's two layers. Drawn as a Skia node rather than recorded
 * with a shader made here: Skia reports every shader made from JS to Hermes as 1 MB of native
 * memory, which, made every frame, set off a garbage collection on the UI thread
 */
export function liquidBody(dots: Float32Array): LiquidBody {
	"worklet";
	const merge = packMergeUniforms(dots);
	if (merge === null) {
		const zeros: number[] = [];
		for (let i = 0; i < MERGE_PACKED_LENGTH; i++) zeros.push(0);
		return {
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			uniforms: mergeUniformsByName(zeros, NO_BODY_COLOR, NO_AMBER, NO_BODY_COLOR),
		};
	}
	const player = readDot(dots, findPlayer(dots), sceneDot());
	const fill = FILL_COLORS[player.color];
	return {
		x: merge.left,
		y: merge.top,
		width: merge.right - merge.left,
		height: merge.bottom - merge.top,
		uniforms: mergeUniformsByName(merge.values, fill, NO_AMBER, fill),
	};
}

/**
 * The wall drops for the canvas to draw with the wall drop shader, in WALL_DROP_SLOTS slots,
 * below the drops layer. Drawn as Skia nodes for the same reason as the liquid body: a drip
 * forms on a wall nearly all the time in a late run, and a shader made per drip per frame
 * set off a garbage collection on the UI thread
 */
export function wallDrops(dots: Float32Array): WallDropSlot[] {
	"worklet";
	return wallDropSlots(dots, FILL_COLORS);
}

/**
 * Draw one frame of the scene (see sceneRecord.ts for the records) on the UI thread, lit from
 * a light tilted by (`lightX`, `lightY`) radians.
 *
 * Every dot is drawn as a lit glass bead: a soft halo in its own colour, a solid body and a
 * specular glare whose position follows the device tilt, so the dots read as physical
 * objects under a fixed light. The player dot has no halo, so its edge stays sharp and the
 * gap to other dots is easy to judge. What marks it as the player's is that it alone is
 * liquid: it trails, stretches and sloshes as it moves and ripples gently at rest (see
 * jelly.ts), while every other dot stays rigid glass.
 * Caught dots merge into the player like water droplets: the player and every merging dot
 * are one body under the metaball shader, so a neck forms between them as the dot slides in
 * and the player swells and settles once it has flowed in.
 * A wrong-colour dot the player touches is refused, like a ball hitting a water balloon: it
 * presses a dent into the liquid and is pushed back out, drawn on top of the liquid so it
 * never looks taken in.
 * A point dot is a yolk: its shell is the player's colour, so like every dot of that colour
 * it reads as safe to catch, and its core shows the colour it turns the player into. The yolk
 * is drawn to the player wherever they are, and as they come near the whole dot leans out
 * toward them, as if reaching.
 * The walls are wet. A small dot begins as a drip swelling out of a wall, leaning the way it
 * will go and joined to it by a fillet that tears as the drip shoots off; and the player
 * pushed into a wall presses into it. Both
 * of these are cut off at the wall and wet it, by the wall shaders (see wallDropShader.ts
 * and mergeShader.ts); every other dot is a plain circle.
 */
export function drawScene(
	canvas: SkCanvas,
	dots: Float32Array,
	lightX: number,
	lightY: number,
	layer: SceneLayer,
) {
	"worklet";
	// The glare slides across each dot with the light; see GLARE_PAINT for the transform
	const gx = glareOffset(lightX);
	const gy = glareOffset(lightY);

	const count = dotCount(dots);
	const dot = sceneDot();
	// The loops below index the record directly and decode a dot with readDot only when it
	// needs more than its place, size and colour: calling a worklet allocates on every call,
	// and four passes over every dot would set off a garbage collection nearly every frame
	// (see FIELD in sceneRecord.ts)
	const { X, Y, RADIUS, KIND, STRETCH_X, STRETCH_Y, WALL_X, WALL_Y, STRIDE } = FIELD;
	const SMALL = KIND_CODE.small;
	const POINT = KIND_CODE.point;
	const PLAYER = KIND_CODE.player;
	const MERGING = KIND_CODE.merging;
	const REJECTED = KIND_CODE.rejected;
	if (layer === "above") {
		drawAbove();
		return;
	}
	if (layer === "drops") {
		drawDropGlares();
		return;
	}
	// Every halo first, so no glow sits on top of a neighbouring body (a merging dot's halo
	// shrinks away as the dot slides into the player); then the plain small dots' bodies and
	// glares, all as sprites (see dotSprites.ts)
	const sprites = spriteBuffers();
	packDotSprites(dots, gx, gy, sprites);
	drawSprites(canvas, sprites.halos, false);
	drawSprites(canvas, sprites.bodies, false);
	drawSprites(canvas, sprites.glares, false);
	// A glass bead: body, the yolk of a point dot and glare, all stretched along its lean
	function drawBead(bead: SceneDot) {
		const { x, y, radius, stretchX: sx, stretchY: sy } = bead;
		const stretch = Math.hypot(sx, sy);
		canvas.save();
		if (stretch > 0) {
			const degrees = (Math.atan2(sy, sx) * 180) / Math.PI;
			canvas.translate(x, y);
			canvas.rotate(degrees, 0, 0);
			canvas.scale(1 + stretch, 1 / (1 + stretch));
			canvas.rotate(-degrees, 0, 0);
			canvas.translate(-x, -y);
		}
		FILL_PAINT.setColor(FILL_COLORS[bead.color]);
		canvas.drawCircle(x, y, radius, FILL_PAINT);
		if (bead.core >= 0) {
			FILL_PAINT.setColor(FILL_COLORS[bead.core]);
			canvas.drawCircle(x + bead.coreX, y + bead.coreY, radius * YOLK_RADIUS, FILL_PAINT);
		}
		canvas.translate(x + gx * radius, y + gy * radius);
		canvas.scale(radius, radius);
		canvas.drawCircle(-gx, -gy, 1, GLARE_PAINT);
		canvas.restore();
	}
	// The glare on a dot, from its place and size
	function drawGlare(x: number, y: number, radius: number) {
		drawGlareAt(canvas, x, y, radius, gx, gy);
	}
	// A small dot at a wall past the canvas's slots: its body by the wall shader, then its glare
	function drawWallDrop(drop: SceneDot) {
		const packed = packWallDropUniforms(drop);
		const color = FILL_COLORS[drop.color];
		packed.values.push(color[0], color[1], color[2], color[3]);
		const dropShader = WALL_DROP_EFFECT.makeShader(packed.values);
		WALL_DROP_PAINT.setShader(dropShader);
		canvas.drawRect(
			Skia.XYWHRect(
				packed.left,
				packed.top,
				packed.right - packed.left,
				packed.bottom - packed.top,
			),
			WALL_DROP_PAINT,
		);
		dropShader.dispose();
		drawGlare(drop.x, drop.y, drop.radius);
	}
	// The other free dots, over the plain ones. The first WALL_DROP_SLOTS wall drops are the
	// canvas's (see wallDrops)
	let drops = 0;
	for (let i = 0; i < count; i++) {
		const o = i * STRIDE;
		const kind = dots[o + KIND];
		const radius = dots[o + RADIUS];
		if (radius <= 0 || (kind !== SMALL && kind !== POINT)) continue;
		// At a wall, as hasWall judges it
		if (
			kind === SMALL &&
			Math.abs(dots[o + WALL_X]) + Math.abs(dots[o + WALL_Y]) >= WALL_NORMAL_MIN
		) {
			if (drops++ >= WALL_DROP_SLOTS) drawWallDrop(readDot(dots, i, dot));
		} else if (kind === POINT || dots[o + STRETCH_X] !== 0 || dots[o + STRETCH_Y] !== 0) {
			drawBead(readDot(dots, i, dot));
		}
	}
	// The glare on each wall drop the canvas drew, over its body (see wallDrops)
	function drawDropGlares() {
		let drops = 0;
		for (let i = 0; i < count && drops < WALL_DROP_SLOTS; i++) {
			const o = i * STRIDE;
			const radius = dots[o + RADIUS];
			if (
				dots[o + KIND] !== SMALL ||
				radius <= 0 ||
				Math.abs(dots[o + WALL_X]) + Math.abs(dots[o + WALL_Y]) < WALL_NORMAL_MIN
			) {
				continue;
			}
			drops++;
			drawGlare(dots[o + X], dots[o + Y], radius);
		}
	}
	// Over the liquid body: the glare on it, and a refused dot pressing into it
	function drawAbove() {
		// Glare on the liquid: fading on each merging dot, full on the player and stretched
		// with it
		for (let i = 0; i < count; i++) {
			const o = i * STRIDE;
			const code = dots[o + KIND];
			if (dots[o + RADIUS] <= 0 || (code !== PLAYER && code !== MERGING)) continue;
			const { radius, x, y } = readDot(dots, i, dot);
			const isPlayer = code === PLAYER;
			GLARE_PAINT.setAlphaf(isPlayer ? 1 : 1 - dot.merge);
			canvas.save();
			if (isPlayer) {
				const k = 1 + Math.hypot(dot.stretchX, dot.stretchY);
				const degrees = (Math.atan2(dot.stretchY, dot.stretchX) * 180) / Math.PI;
				canvas.translate(x, y);
				canvas.rotate(degrees, 0, 0);
				canvas.scale(k, 1 / k);
				canvas.rotate(-degrees, 0, 0);
				canvas.translate(-x, -y);
			}
			canvas.translate(x + gx * radius, y + gy * radius);
			canvas.scale(radius, radius);
			canvas.drawCircle(-gx, -gy, 1, GLARE_PAINT);
			canvas.restore();
		}
		GLARE_PAINT.setAlphaf(1);
		// A refused dot sits on top, in the dent it presses into the liquid
		for (let i = 0; i < count; i++) {
			const o = i * STRIDE;
			if (dots[o + KIND] === REJECTED && dots[o + RADIUS] > 0) drawBead(readDot(dots, i, dot));
		}
	}
}
