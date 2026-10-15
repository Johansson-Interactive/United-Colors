import {
	dotCount,
	FIELD,
	KIND_CODE,
	readDot,
	type SceneDot,
	sceneDot,
	WALL_NORMAL_MIN,
} from "../application/sceneRecord";
import { SMIN_SKSL, WALL_SKSL } from "./liquidShader";

/**
 * A small dot at a wall: a drip forming on it or one that has just shot off it (see
 * wall.ts). The dot is a circle stretched into an
 * area-preserving ellipse along `stretch` (as the player's liquid is, see liquidShader.ts),
 * joined to the wall by a wet fillet `neck` wide and cut off at the wall. Anti-aliased over
 * one point; output is premultiplied.
 *
 * Uniforms, in order: `center`, `radius`, `stretch` (long-axis vector, length the stretch
 * fraction), `wall` (inward unit normal x, y and offset, see sceneRecord.ts SceneDot.wallX),
 * `neck` (points) and `color` (unpremultiplied RGBA).
 */
export const WALL_DROP_SKSL = `
uniform float2 center;
uniform float radius;
uniform float2 stretch;
uniform float3 wall;
uniform float neck;
uniform float4 color;
${SMIN_SKSL}
${WALL_SKSL}
half4 main(float2 p) {
	float2 q = p - center;
	float e = length(stretch);
	float2 u = e > 0.0001 ? stretch / e : float2(1.0, 0.0);
	float k = 1.0 + e;
	float2 l = float2(dot(q, u) / k, dot(q, float2(-u.y, u.x)) * k);
	float d = atWall((length(l) - radius) / k, p, wall, neck);
	float a = 1.0 - smoothstep(-0.5, 0.5, d);
	return half4(color.rgb * a, a);
}
`;

export interface WallDropUniforms {
	/** Flat uniform values in declaration order, minus `color` (appended by the caller) */
	values: number[];
	/** Rect to fill with the shader, padded so the stretch and the fillet are never clipped */
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Pack a small dot at a wall, read from the drawable scene, into shader uniforms */
export function packWallDropUniforms(dot: SceneDot): WallDropUniforms {
	"worklet";
	const { x, y, radius, stretchX, stretchY, neck } = dot;
	const reach = radius * (1 + Math.hypot(stretchX, stretchY)) + neck + 1;
	return {
		values: [x, y, radius, stretchX, stretchY, dot.wallX, dot.wallY, dot.wallC, neck],
		left: x - reach,
		top: y - reach,
		right: x + reach,
		bottom: y + reach,
	};
}

/**
 * The wall drop shader's uniforms by name, as Skia's declarative <Shader> takes them: the
 * packed values (see packWallDropUniforms) cut at the declarations in WALL_DROP_SKSL, with
 * `color` added
 */
export interface WallDropUniformsByName {
	[name: string]: number | number[];
	center: number[];
	radius: number;
	stretch: number[];
	wall: number[];
	neck: number;
	color: number[];
}

/** Cut packed values (without `color`) into named uniforms, with `color` (RGBA) added */
export function wallDropUniformsByName(
	values: number[],
	color: ArrayLike<number>,
): WallDropUniformsByName {
	"worklet";
	return {
		center: [values[0], values[1]],
		radius: values[2],
		stretch: [values[3], values[4]],
		wall: [values[5], values[6], values[7]],
		neck: values[8],
		color: [color[0], color[1], color[2], color[3]],
	};
}

/**
 * Wall drops drawn as fixed shader nodes (see WallDropSlot); any more at once are drawn with a
 * shader made per frame. A late run has one or two on the walls at a time.
 */
export const WALL_DROP_SLOTS = 4;

/** One wall drop for the canvas to draw with the wall drop shader: where, and its uniforms */
export interface WallDropSlot {
	x: number;
	y: number;
	width: number;
	height: number;
	uniforms: WallDropUniformsByName;
}

/** An unused slot: an empty rect, with uniforms the shader still accepts */
const NO_DROP: WallDropSlot = {
	x: 0,
	y: 0,
	width: 0,
	height: 0,
	uniforms: wallDropUniformsByName([0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0]),
};

/**
 * The first WALL_DROP_SLOTS wall drops (small dots at a wall, as hasWall judges it) in the
 * scene, in scene order, each in a slot with its colour from `colors` (indexed by the scene's
 * colour index); unused slots are empty. drawScene skips these drops' bodies the same way.
 */
export function wallDropSlots(
	scene: Float32Array,
	colors: readonly ArrayLike<number>[],
): WallDropSlot[] {
	"worklet";
	const slots: WallDropSlot[] = [];
	const count = dotCount(scene);
	const dot = sceneDot();
	for (let i = 0; i < count && slots.length < WALL_DROP_SLOTS; i++) {
		// Indexed directly: a worklet call per dot would allocate every frame (see FIELD)
		const o = i * FIELD.STRIDE;
		if (
			scene[o + FIELD.KIND] !== KIND_CODE.small ||
			scene[o + FIELD.RADIUS] <= 0 ||
			Math.abs(scene[o + FIELD.WALL_X]) + Math.abs(scene[o + FIELD.WALL_Y]) < WALL_NORMAL_MIN
		) {
			continue;
		}
		const packed = packWallDropUniforms(readDot(scene, i, dot));
		slots.push({
			x: packed.left,
			y: packed.top,
			width: packed.right - packed.left,
			height: packed.bottom - packed.top,
			uniforms: wallDropUniformsByName(packed.values, colors[dot.color]),
		});
	}
	while (slots.length < WALL_DROP_SLOTS) slots.push(NO_DROP);
	return slots;
}
