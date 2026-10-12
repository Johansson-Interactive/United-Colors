import { JELLY_MAX_STRETCH } from "../application/jelly";
import {
	SCENE_DENT,
	SCENE_KIND,
	SCENE_KIND_MERGING,
	SCENE_KIND_PLAYER,
	SCENE_KIND_REJECTED,
	SCENE_NECK,
	SCENE_RADIUS,
	SCENE_STRETCH_X,
	SCENE_STRETCH_Y,
	SCENE_STRIDE,
	SCENE_WALL_X,
	SCENE_WALL2_C,
	SCENE_WOBBLE,
	SCENE_X,
	SCENE_Y,
} from "../application/renderScene";
import { LIQUID_SKSL, LIQUID_WOBBLE, SMIN_SKSL, WALL_SKSL } from "./liquidShader";

/** Most bodies (the player plus dots merging into it) the shader draws as one liquid */
export const MERGE_MAX_BLOBS = 8;
/** Smooth-min radius as a multiple of the player radius: how early two bodies start to neck */
export const MERGE_BLEND = 0.9;
/** The dent a refused dot presses is this much wider than the dot, as a fraction of its radius */
export const DENT_GAP = 0.06;
/** How softly the dent's rim curves into the player, as a fraction of the refused dot's radius */
export const DENT_SOFTNESS = 0.7;

/**
 * Metaball shader: the player and the dots merging into it as one liquid body. Each body is
 * a signed distance to its circle; a polynomial smooth-min joins them, so two bodies grow a
 * neck as they near and flow into one as they meet, like water droplets. Anti-aliased over
 * one point around the zero contour; output is premultiplied.
 *
 * The player (the first body) is a liquid drop (see liquidShader.ts): stretched along its
 * jelly stretch vector, with slow ripples round its edge.
 *
 * While the player refuses a wrong-colour dot, the dot presses a dent into it, like a ball
 * into a water balloon: the dot's circle (a little wider) is cut out of the liquid with a
 * smooth max, so the surface curves softly in round it (see rejection.ts).
 *
 * Pushed into a wall (or two, in a corner), the liquid is cut off flat at it and wets it
 * with a fillet `neck` wide (see wall.ts).
 *
 * Uniforms, in order: `blobs` (x, y, radius per body), `count` (bodies in use), `blend`
 * (smooth-min radius in points), `jelly` (the player's stretch x, y and wobble clock in
 * seconds), `dent` (centre x, y, radius and rim softness in points; no dent at radius 0),
 * `walls` (inward normal x, y and offset for each of two walls; a zero normal is none),
 * `neck` (fillet width in points) and `color` (unpremultiplied RGBA).
 */
export const MERGE_SKSL = `
uniform float3 blobs[${MERGE_MAX_BLOBS}];
uniform float count;
uniform float blend;
uniform float3 jelly;
uniform float4 dent;
uniform float3 walls[2];
uniform float neck;
uniform float4 color;
${SMIN_SKSL}
${WALL_SKSL}
${LIQUID_SKSL}
half4 main(float2 p) {
	float d = liquid(p - blobs[0].xy, blobs[0].z, jelly);
	for (int i = 1; i < ${MERGE_MAX_BLOBS}; i++) {
		if (float(i) >= count) break;
		float3 b = blobs[i];
		d = smin(d, length(p - b.xy) - b.z, blend);
	}
	if (dent.z > 0.0) {
		float hole = dent.z - length(p - dent.xy);
		d = dent.w > 0.01 ? -smin(-d, -hole, dent.w) : max(d, hole);
	}
	d = atWall(d, p, walls[0], neck);
	d = atWall(d, p, walls[1], neck);
	float a = 1.0 - smoothstep(-0.5, 0.5, d);
	return half4(color.rgb * a, a);
}
`;

export interface MergeUniforms {
	/** Flat uniform values in declaration order, minus `color` (appended by the caller) */
	values: number[];
	/** Rect to fill with the shader, padded so the smooth-min bulge is never clipped */
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/**
 * Pack the player, every merging dot, the dent of a refused dot and the walls the player is
 * pressed into from the drawable scene into shader uniforms. Returns null when the scene
 * has no player. The player is always the first body.
 */
export function packMergeUniforms(scene: Float32Array): MergeUniforms | null {
	"worklet";
	const blobs: number[] = [];
	let playerRadius = 0;
	let playerOffset = 0;
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;

	let jelly = [0, 0, 0];

	/** `reach` is how far the body can extend from its centre, if past its radius */
	const add = (x: number, y: number, radius: number, reach = radius) => {
		blobs.push(x, y, radius);
		left = Math.min(left, x - reach);
		top = Math.min(top, y - reach);
		right = Math.max(right, x + reach);
		bottom = Math.max(bottom, y + reach);
	};

	for (let i = 0; i < scene.length; i += SCENE_STRIDE) {
		if (scene[i + SCENE_KIND] !== SCENE_KIND_PLAYER) continue;
		playerOffset = i;
		playerRadius = scene[i + SCENE_RADIUS];
		const reach = playerRadius * (1 + JELLY_MAX_STRETCH) * (1 + LIQUID_WOBBLE);
		add(scene[i + SCENE_X], scene[i + SCENE_Y], playerRadius, reach);
		jelly = [scene[i + SCENE_STRETCH_X], scene[i + SCENE_STRETCH_Y], scene[i + SCENE_WOBBLE]];
		break;
	}
	if (blobs.length === 0) return null;

	for (let i = 0; i < scene.length && blobs.length < MERGE_MAX_BLOBS * 3; i += SCENE_STRIDE) {
		if (scene[i + SCENE_KIND] !== SCENE_KIND_MERGING) continue;
		add(scene[i + SCENE_X], scene[i + SCENE_Y], scene[i + SCENE_RADIUS]);
	}

	const count = blobs.length / 3;
	while (blobs.length < MERGE_MAX_BLOBS * 3) blobs.push(0, 0, 0);
	const blend = playerRadius * MERGE_BLEND;
	blobs.push(count, blend, ...jelly);

	// A smooth max only ever cuts the liquid away, so the dent needs no extra bounds
	let dent = [0, 0, 0, 0];
	for (let i = 0; i < scene.length; i += SCENE_STRIDE) {
		if (scene[i + SCENE_KIND] !== SCENE_KIND_REJECTED) continue;
		const radius = scene[i + SCENE_RADIUS];
		dent = [
			scene[i + SCENE_X],
			scene[i + SCENE_Y],
			radius * (1 + DENT_GAP),
			radius * DENT_SOFTNESS * scene[i + SCENE_DENT],
		];
		break;
	}
	blobs.push(...dent);
	// The walls cut the liquid off and wet it with a fillet: the fillet reaches along the
	// wall by up to the neck
	for (let i = SCENE_WALL_X; i <= SCENE_WALL2_C; i++) blobs.push(scene[playerOffset + i]);
	const neck = scene[playerOffset + SCENE_NECK];
	blobs.push(neck);
	// The smooth-min can bulge the surface out by up to blend / 4 beyond either circle
	const pad = blend / 4 + neck + 1;
	return {
		values: blobs,
		left: left - pad,
		top: top - pad,
		right: right + pad,
		bottom: bottom + pad,
	};
}
