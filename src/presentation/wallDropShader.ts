import type { SceneDot } from "../application/sceneRecord";
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
