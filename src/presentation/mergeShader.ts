import {
	SCENE_KIND,
	SCENE_KIND_MERGING,
	SCENE_KIND_PLAYER,
	SCENE_RADIUS,
	SCENE_STRIDE,
	SCENE_X,
	SCENE_Y,
} from "../application/renderScene";

/** Most bodies (the player plus dots merging into it) the shader draws as one liquid */
export const MERGE_MAX_BLOBS = 8;
/** Smooth-min radius as a multiple of the player radius: how early two bodies start to neck */
export const MERGE_BLEND = 0.9;

/**
 * Metaball shader: the player and the dots merging into it as one liquid body. Each body is
 * a signed distance to its circle; a polynomial smooth-min joins them, so two bodies grow a
 * neck as they near and flow into one as they meet, like water droplets. Anti-aliased over
 * one point around the zero contour; output is premultiplied.
 *
 * Uniforms, in order: `blobs` (x, y, radius per body), `count` (bodies in use), `blend`
 * (smooth-min radius in points) and `color` (unpremultiplied RGBA).
 */
export const MERGE_SKSL = `
uniform float3 blobs[${MERGE_MAX_BLOBS}];
uniform float count;
uniform float blend;
uniform float4 color;

float smin(float a, float b, float k) {
	float h = max(k - abs(a - b), 0.0) / k;
	return min(a, b) - h * h * k * 0.25;
}

half4 main(float2 p) {
	float d = 1e6;
	for (int i = 0; i < ${MERGE_MAX_BLOBS}; i++) {
		if (float(i) >= count) break;
		float3 b = blobs[i];
		d = smin(d, length(p - b.xy) - b.z, blend);
	}
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
 * Pack the player and every merging dot from the drawable scene into shader uniforms.
 * Returns null when the scene has no player. The player is always the first body.
 */
export function packMergeUniforms(scene: Float32Array): MergeUniforms | null {
	"worklet";
	const blobs: number[] = [];
	let playerRadius = 0;
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;

	const add = (x: number, y: number, radius: number) => {
		blobs.push(x, y, radius);
		left = Math.min(left, x - radius);
		top = Math.min(top, y - radius);
		right = Math.max(right, x + radius);
		bottom = Math.max(bottom, y + radius);
	};

	for (let i = 0; i < scene.length; i += SCENE_STRIDE) {
		if (scene[i + SCENE_KIND] !== SCENE_KIND_PLAYER) continue;
		playerRadius = scene[i + SCENE_RADIUS];
		add(scene[i + SCENE_X], scene[i + SCENE_Y], playerRadius);
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
	blobs.push(count, blend);
	// The smooth-min can bulge the surface out by up to blend / 4 beyond either circle
	const pad = blend / 4 + 1;
	return {
		values: blobs,
		left: left - pad,
		top: top - pad,
		right: right + pad,
		bottom: bottom + pad,
	};
}
