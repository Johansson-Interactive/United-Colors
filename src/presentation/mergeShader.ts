import { JELLY_MAX_STRETCH, JELLY_WOBBLE_PERIOD_S } from "../application/jelly";
import { MERGE_MAX_DOTS } from "../application/renderScene";
import {
	dotCount,
	FIELD,
	findDent,
	findPlayer,
	KIND_CODE,
	readDot,
	sceneDot,
} from "../application/sceneRecord";
import { LIQUID_SKSL, LIQUID_WOBBLE, SMIN_SKSL, WALL_SKSL } from "./liquidShader";

/**
 * Bodies the shader draws as one liquid: the player plus every dot the scene builder draws
 * merging into it, so no merging dot is ever left out of the body
 */
export const MERGE_MAX_BLOBS = 1 + MERGE_MAX_DOTS;
/** Smooth-min radius as a multiple of the player radius: how early two bodies start to neck */
export const MERGE_BLEND = 0.9;
/** How far a drop of the liquid can reach from its centre, in radii: stretched and wobbling */
export const LIQUID_REACH = (1 + JELLY_MAX_STRETCH) * (1 + LIQUID_WOBBLE);
/** The dent a refused dot presses is this much wider than the dot, as a fraction of its radius */
export const DENT_GAP = 0.06;
/** How softly the dent's rim curves into the player, as a fraction of the refused dot's radius */
export const DENT_SOFTNESS = 0.7;

/** The amber level that draws no amber layer, as in play: far below any body (px) */
export const NO_AMBER = 1e6;
/** How far the amber's surface waves at rest, as a fraction of the drop's radius */
const AMBER_REST_WAVE = 0.02;
/** How much further it waves with the liquid at full slosh (stretched to JELLY_MAX_STRETCH) */
const AMBER_SLOSH_WAVE = 0.05;
/** How far it tips at the drop's edge with the liquid at full sideways slosh, in radii */
const AMBER_TILT = 0.06;

/**
 * SkSL for the amber layer's surface in the first body, a drop of radius `r`: how far below
 * its centre the surface is at `x` across from it, around the layer's `level`. A slow wave
 * travels across it on the ripple clock (`shape.z`), so it is never ruler-flat; the liquid's
 * slosh (its jelly stretch, `shape.xy`, see jelly.ts) makes it wave harder and tips it.
 */
const AMBER_SKSL = `
float amberSurface(float x, float level, float r, float3 shape) {
	float u = x / max(r, 1.0);
	float t = shape.z * ${(2 * Math.PI) / JELLY_WOBBLE_PERIOD_S};
	// Whole cycles a wobble period, so the wave goes on smoothly as the clock wraps
	float w = 0.6 * sin(5.0 * u - 7.0 * t) + 0.4 * sin(8.0 * u + 11.0 * t);
	float slosh = length(shape.xy) / ${JELLY_MAX_STRETCH};
	float tilt = shape.x / ${JELLY_MAX_STRETCH};
	return level + r * ((${AMBER_REST_WAVE} + ${AMBER_SLOSH_WAVE} * slosh) * w
		+ ${AMBER_TILT} * tilt * u);
}
`;

/**
 * Furthest the amber layer's surface strays from its level (px) across a drop of `radius`
 * whose liquid has the jelly stretch `jelly`, as AMBER_SKSL waves and tips it
 */
export function amberWaveReach(
	jelly: { stretchX: number; stretchY: number },
	radius: number,
): number {
	"worklet";
	const slosh = Math.hypot(jelly.stretchX, jelly.stretchY) / JELLY_MAX_STRETCH;
	const tilt = Math.abs(jelly.stretchX) / JELLY_MAX_STRETCH;
	return radius * (AMBER_REST_WAVE + AMBER_SLOSH_WAVE * slosh + AMBER_TILT * tilt);
}

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
 * Below the amber layer's wavy surface (see AMBER_SKSL) the liquid is amber, as the game
 * over's drop holds its combo bonus. Play has no amber layer: its level is NO_AMBER, and the
 * shader skips the surface.
 *
 * Uniforms, in order: `blobs` (x, y, radius per body), `count` (bodies in use), `blend`
 * (smooth-min radius in points), `jelly` (the player's stretch x, y and wobble clock in
 * seconds), `dent` (centre x, y, radius and rim softness in points; no dent at radius 0),
 * `walls` (inward normal x, y and offset for each of two walls; a zero normal is none),
 * `neck` (fillet width in points), `color` (unpremultiplied RGBA), `amber` (the amber layer's
 * level in points below the first body's centre) and `amberColor` (unpremultiplied RGBA).
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
uniform float amber;
uniform float4 amberColor;
${SMIN_SKSL}
${WALL_SKSL}
${LIQUID_SKSL}
${AMBER_SKSL}
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
	float3 rgb = color.rgb;
	if (amber < ${NO_AMBER.toFixed(1)}) {
		float2 q = p - blobs[0].xy;
		float below = q.y - amberSurface(q.x, amber, blobs[0].z, jelly);
		rgb = mix(rgb, amberColor.rgb, smoothstep(-0.5, 0.5, below));
	}
	return half4(rgb * a, a);
}
`;

/**
 * The merge shader's uniforms by name, as Skia's declarative <Shader> takes them: the packed
 * values (see packMergeUniforms) cut at the declarations in MERGE_SKSL, with `color` and the
 * amber layer added
 */
export interface MergeUniformsByName {
	[name: string]: number | number[];
	blobs: number[];
	count: number;
	blend: number;
	jelly: number[];
	dent: number[];
	walls: number[];
	neck: number;
	color: number[];
	amber: number;
	amberColor: number[];
}

/** Floats each uniform takes, in declaration order (see MERGE_SKSL) */
const UNIFORM_SIZES = [
	["blobs", 3 * MERGE_MAX_BLOBS],
	["count", 1],
	["blend", 1],
	["jelly", 3],
	["dent", 4],
	["walls", 6],
	["neck", 1],
] as const;

/**
 * Cut packed values (without `color`) into named uniforms, with `color` (RGBA) added, and an
 * amber layer `amber` points below the first body's centre in `amberColor` (RGBA): NO_AMBER
 * for none, as in play
 */
export function mergeUniformsByName(
	values: number[],
	color: ArrayLike<number>,
	amber: number,
	amberColor: ArrayLike<number>,
): MergeUniformsByName {
	"worklet";
	let at = 0;
	const take = (size: number) => {
		const part = values.slice(at, at + size);
		at += size;
		return part;
	};
	const blobs = take(UNIFORM_SIZES[0][1]);
	const count = take(1)[0];
	const blend = take(1)[0];
	const jelly = take(3);
	const dent = take(4);
	const walls = take(6);
	const neck = take(1)[0];
	return {
		blobs,
		count,
		blend,
		jelly,
		dent,
		walls,
		neck,
		color: [color[0], color[1], color[2], color[3]],
		amber,
		amberColor: [amberColor[0], amberColor[1], amberColor[2], amberColor[3]],
	};
}

/** Floats of packed values packMergeUniforms produces, `color` aside */
export const MERGE_PACKED_LENGTH = UNIFORM_SIZES.reduce((sum, [, size]) => sum + size, 0);

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
	const playerIndex = findPlayer(scene);
	if (playerIndex < 0) return null;
	const player = readDot(scene, playerIndex, sceneDot());
	const blobs: number[] = [];
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;

	/** `reach` is how far the body can extend from its centre, if past its radius */
	const add = (x: number, y: number, radius: number, reach = radius) => {
		blobs.push(x, y, radius);
		left = Math.min(left, x - reach);
		top = Math.min(top, y - reach);
		right = Math.max(right, x + reach);
		bottom = Math.max(bottom, y + reach);
	};

	const playerReach = player.radius * LIQUID_REACH;
	add(player.x, player.y, player.radius, playerReach);

	const count = dotCount(scene);
	const body = sceneDot();
	for (let i = 0; i < count && blobs.length < MERGE_MAX_BLOBS * 3; i++) {
		// Indexed directly: a worklet call per dot would allocate every frame (see FIELD)
		if (scene[i * FIELD.STRIDE + FIELD.KIND] !== KIND_CODE.merging) continue;
		readDot(scene, i, body);
		add(body.x, body.y, body.radius);
	}

	const bodies = blobs.length / 3;
	while (blobs.length < MERGE_MAX_BLOBS * 3) blobs.push(0, 0, 0);
	const blend = player.radius * MERGE_BLEND;
	blobs.push(bodies, blend, player.stretchX, player.stretchY, player.wobble);

	// A smooth max only ever cuts the liquid away, so the dent needs no extra bounds
	const dentIndex = findDent(scene);
	if (dentIndex < 0) {
		blobs.push(0, 0, 0, 0);
	} else {
		const dent = readDot(scene, dentIndex, body);
		blobs.push(
			dent.x,
			dent.y,
			dent.radius * (1 + DENT_GAP),
			dent.radius * DENT_SOFTNESS * dent.dent,
		);
	}
	// The walls cut the liquid off and wet it with a fillet: the fillet reaches along the
	// wall by up to the neck
	blobs.push(player.wallX, player.wallY, player.wallC, player.wall2X, player.wall2Y, player.wall2C);
	blobs.push(player.neck);
	// The smooth-min can bulge the surface out by up to blend / 4 beyond either circle
	const pad = blend / 4 + player.neck + 1;
	return {
		values: blobs,
		left: left - pad,
		top: top - pad,
		right: right + pad,
		bottom: bottom + pad,
	};
}
