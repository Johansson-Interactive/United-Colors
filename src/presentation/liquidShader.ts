import { JELLY_WOBBLE_PERIOD_S } from "../application/jelly";
import { HAS_WALL_SKSL } from "../application/sceneRecord";

/** Peak edge wobble of a liquid drop, as a fraction of its radius */
export const LIQUID_WOBBLE = 0.03;

/**
 * SkSL for a polynomial smooth-min of two signed distances: their union, with a fillet of
 * radius `k` where the two surfaces meet, so bodies grow a neck as they near. Bulges out by
 * at most k / 4 beyond either, and by up to k along a surface from where they meet.
 */
export const SMIN_SKSL = `
float smin(float a, float b, float k) {
	float h = max(k - abs(a - b), 0.0) / k;
	return min(a, b) - h * h * k * 0.25;
}
`;

/**
 * SkSL that meets a body of signed distance `d` with the wall whose inward unit normal and
 * offset are `wall` (see sceneRecord.ts, SceneDot.wallX): joined to it by a wet fillet
 * `neck` wide when the neck is set, and cut off at it either way. A zero normal is no wall,
 * judged as the scene record judges it.
 */
export const WALL_SKSL = `${HAS_WALL_SKSL}
float atWall(float d, float2 p, float3 wall, float neck) {
	if (!hasWall(wall)) return d;
	float w = dot(p, wall.xy) - wall.z;
	if (neck > 0.0) d = smin(d, w, neck);
	return max(d, -w);
}
`;

/**
 * SkSL for the signed distance to a liquid drop (the player, the play button): a circle of
 * radius `r` at the origin, stretched into an area-preserving ellipse along its jelly stretch
 * vector (`shape.xy`, see jelly.ts), with a few slow ripples travelling round its edge on
 * the wobble clock (`shape.z`, seconds). The distance is only approximate, which one-point
 * anti-aliasing never shows at these strains.
 */
export const LIQUID_SKSL = `
float liquid(float2 q, float r, float3 shape) {
	float e = length(shape.xy);
	float2 u = e > 0.0001 ? shape.xy / e : float2(1.0, 0.0);
	float k = 1.0 + e;
	float2 l = float2(dot(q, u) / k, dot(q, float2(-u.y, u.x)) * k);
	// Ripples in screen space, so they keep turning while the stretch changes direction
	float a = atan(q.y, q.x);
	float t = shape.z * ${(2 * Math.PI) / JELLY_WOBBLE_PERIOD_S};
	float w = 0.5 * sin(3.0 * a + 9.0 * t) + 0.3 * sin(4.0 * a - 13.0 * t)
		+ 0.2 * sin(5.0 * a + 17.0 * t);
	return (length(l) - r * (1.0 + ${LIQUID_WOBBLE} * w)) / k;
}
`;

/**
 * A single liquid drop lit like a glass bead, for the play button. Uniforms, in order:
 * `center`, `radius`, `jelly` (stretch x, y and wobble clock), `color` (unpremultiplied
 * RGBA) and `glare` (centre x, y and radius of the white highlight). Output is premultiplied.
 */
export const DROP_SKSL = `
uniform float2 center;
uniform float radius;
uniform float3 jelly;
uniform float4 color;
uniform float3 glare;
${LIQUID_SKSL}
half4 main(float2 p) {
	float a = color.a * (1.0 - smoothstep(-0.5, 0.5, liquid(p - center, radius, jelly)));
	float g = 0.5 * max(0.0, 1.0 - length(p - glare.xy) / glare.z);
	return half4(mix(color.rgb, float3(1.0), g) * a, a);
}
`;
