import {
	type SkCanvas,
	Skia,
	type SkRuntimeEffect,
	TileMode,
	vec,
} from "@shopify/react-native-skia";
import { YOLK_RADIUS } from "../application/renderScene";
import {
	dotCount,
	findPlayer,
	hasWall,
	readDot,
	type SceneDot,
	sceneDot,
} from "../application/sceneRecord";
import { GAME_COLORS } from "../domain/constants";
import { MERGE_SKSL, packMergeUniforms } from "./mergeShader";
import { packWallDropUniforms, WALL_DROP_SKSL } from "./wallDropShader";

/** Glare centre offset and radius relative to a unit-radius dot, when the device is level */
const GLARE_OFFSET = -0.28;
const GLARE_RADIUS = 0.75;
/** How far (unit radii per radian of tilt) the light slides across each dot */
const GLARE_TILT_GAIN = 0.45;
const GLARE_MAX_OFFSET = 0.55;
/** Halo (soft glow behind each non-player dot) size relative to its radius */
const HALO_SCALE = 1.9;

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
		[Skia.Color("rgba(255,255,255,0.55)"), Skia.Color("rgba(255,255,255,0)")],
		null,
		TileMode.Clamp,
	),
);

function compileEffect(name: string, sksl: string): SkRuntimeEffect {
	const effect = Skia.RuntimeEffect.Make(sksl);
	if (!effect) throw new Error(`${name} shader failed to compile`);
	return effect;
}

/**
 * The player and the dots merging into it, drawn as one liquid body by the metaball shader
 * (see mergeShader.ts). Compiled once; the uniforms are rebuilt every frame.
 */
const MERGE_EFFECT = compileEffect("merge", MERGE_SKSL);
const MERGE_PAINT = Skia.Paint();
MERGE_PAINT.setAntiAlias(true);

/** A small dot at a wall (see wallDropShader.ts), the same way */
const WALL_DROP_EFFECT = compileEffect("wall drop", WALL_DROP_SKSL);
const WALL_DROP_PAINT = Skia.Paint();
WALL_DROP_PAINT.setAntiAlias(true);

/** Unit-space soft glow per game colour, indexed like FILL_COLORS */
const HALO_PAINTS = FILL_COLORS.map((color) => {
	const paint = Skia.Paint();
	paint.setAntiAlias(true);
	const withAlpha = (alpha: number) => {
		const c = Float32Array.from(color);
		c[3] = alpha;
		return c;
	};
	paint.setShader(
		Skia.Shader.MakeRadialGradient(
			vec(0, 0),
			1,
			[withAlpha(0.5), withAlpha(0.16), withAlpha(0)],
			[0.3, 0.6, 1],
			TileMode.Clamp,
		),
	);
	return paint;
});

/** Where the glare sits on a unit dot for a light tilted by `light` radians, clamped on the dot */
function glareOffset(light: number): number {
	"worklet";
	return Math.max(
		-GLARE_MAX_OFFSET,
		Math.min(GLARE_MAX_OFFSET, GLARE_OFFSET - light * GLARE_TILT_GAIN),
	);
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
export function drawScene(canvas: SkCanvas, dots: Float32Array, lightX: number, lightY: number) {
	"worklet";
	// The glare slides across each dot with the light; see GLARE_PAINT for the transform
	const gx = glareOffset(lightX);
	const gy = glareOffset(lightY);

	const count = dotCount(dots);
	const dot = sceneDot();
	// Halos first so no glow sits on top of a neighbouring body; a merging dot's halo
	// shrinks away as the dot slides into the player
	for (let i = 0; i < count; i++) {
		const { radius, kind } = readDot(dots, i, dot);
		if (radius <= 0 || kind === "player") continue;
		const fade = kind === "merging" ? 1 - dot.merge : 1;
		const scale = radius * HALO_SCALE * fade;
		if (scale <= 0) continue;
		canvas.save();
		canvas.translate(dot.x, dot.y);
		canvas.scale(scale, scale);
		canvas.drawCircle(0, 0, 1, HALO_PAINTS[dot.color]);
		canvas.restore();
	}
	// A glass bead: body, the yolk of a point dot and glare, all stretched along its lean
	const drawBead = (bead: SceneDot) => {
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
	};
	// A small dot at a wall: its body by the wall shader, then its glare
	const drawWallDrop = (drop: SceneDot) => {
		const packed = packWallDropUniforms(drop);
		const color = FILL_COLORS[drop.color];
		packed.values.push(color[0], color[1], color[2], color[3]);
		WALL_DROP_PAINT.setShader(WALL_DROP_EFFECT.makeShader(packed.values));
		canvas.drawRect(
			Skia.XYWHRect(
				packed.left,
				packed.top,
				packed.right - packed.left,
				packed.bottom - packed.top,
			),
			WALL_DROP_PAINT,
		);
		const { radius } = drop;
		canvas.save();
		canvas.translate(drop.x + gx * radius, drop.y + gy * radius);
		canvas.scale(radius, radius);
		canvas.drawCircle(-gx, -gy, 1, GLARE_PAINT);
		canvas.restore();
	};
	// Free dots
	for (let i = 0; i < count; i++) {
		const { kind, radius } = readDot(dots, i, dot);
		if (radius <= 0) continue;
		if (kind === "small" && hasWall(dot.wallX, dot.wallY)) {
			drawWallDrop(dot);
		} else if (kind === "small" || kind === "point") {
			drawBead(dot);
		}
	}
	// The player and whatever is merging into it, as one liquid body
	const merge = packMergeUniforms(dots);
	if (merge === null) return;
	const color = FILL_COLORS[readDot(dots, findPlayer(dots), dot).color];
	merge.values.push(color[0], color[1], color[2], color[3]);
	MERGE_PAINT.setShader(MERGE_EFFECT.makeShader(merge.values));
	canvas.drawRect(
		Skia.XYWHRect(merge.left, merge.top, merge.right - merge.left, merge.bottom - merge.top),
		MERGE_PAINT,
	);
	// Glare on the liquid: fading on each merging dot, full on the player and stretched
	// with it
	for (let i = 0; i < count; i++) {
		const { radius, kind, x, y } = readDot(dots, i, dot);
		if (radius <= 0 || (kind !== "player" && kind !== "merging")) continue;
		const isPlayer = kind === "player";
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
		if (readDot(dots, i, dot).kind === "rejected" && dot.radius > 0) drawBead(dot);
	}
}
