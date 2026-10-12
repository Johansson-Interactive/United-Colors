import {
	SCENE_NECK,
	SCENE_RADIUS,
	SCENE_STRETCH_X,
	SCENE_STRETCH_Y,
	SCENE_WALL_C,
	SCENE_WALL_X,
	SCENE_WALL_Y,
	SCENE_X,
	SCENE_Y,
} from "../application/renderScene";
import { SMIN_SKSL, WALL_SKSL } from "./liquidShader";

/**
 * A small dot at a wall: a drip forming on it or one that has just shot off it (see
 * wall.ts). The dot is a circle stretched into an
 * area-preserving ellipse along `stretch` (as the player's liquid is, see liquidShader.ts),
 * joined to the wall by a wet fillet `neck` wide and cut off at the wall. Anti-aliased over
 * one point; output is premultiplied.
 *
 * Uniforms, in order: `center`, `radius`, `stretch` (long-axis vector, length the stretch
 * fraction), `wall` (inward unit normal x, y and offset, see renderScene.ts SCENE_WALL_X),
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

/** Pack the dot whose record starts at `offset` in the drawable scene into shader uniforms */
export function packWallDropUniforms(scene: Float32Array, offset: number): WallDropUniforms {
	"worklet";
	const x = scene[offset + SCENE_X];
	const y = scene[offset + SCENE_Y];
	const radius = scene[offset + SCENE_RADIUS];
	const stretchX = scene[offset + SCENE_STRETCH_X];
	const stretchY = scene[offset + SCENE_STRETCH_Y];
	const neck = scene[offset + SCENE_NECK];
	const reach = radius * (1 + Math.hypot(stretchX, stretchY)) + neck + 1;
	return {
		values: [
			x,
			y,
			radius,
			stretchX,
			stretchY,
			scene[offset + SCENE_WALL_X],
			scene[offset + SCENE_WALL_Y],
			scene[offset + SCENE_WALL_C],
			neck,
		],
		left: x - reach,
		top: y - reach,
		right: x + reach,
		bottom: y + reach,
	};
}
