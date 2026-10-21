/**
 * The room the dots live in, drawn by the game canvas under the scene: ink, a soft pool of
 * light that slides against the tilt as if the phone were lit from above, and an edge wash in
 * the accent colour. The pure parts are here; the paints are in GameCanvas.tsx.
 */

/** Light pool: its brightest, at the centre, as white over the ink */
const LIGHT_PEAK = 0.075;
/** Light pool radius as a fraction of the room's longer side */
const LIGHT_RADIUS = 0.95;

/** Edge wash: clear out to this fraction of its radius, easing in toward the corners */
const WASH_START = 0.55;
const WASH_PEAK = 0.26;
/** Wash radius as a fraction of the room's diagonal */
const WASH_RADIUS = 0.55;

/**
 * The room as one shader, ink, light and wash computed together per pixel. The light is so
 * faint over the dark ink that it only spans about 18 8-bit steps; drawn as gradients, each
 * step showed as a ring that crawled as the light moved. Here the falloffs are the exact
 * smoothstep curves (no stops whose slope changes read as rings) and the room is rounded to 8
 * bits once, after adding triangular noise of one step either way per device pixel: unlike
 * Skia's ordered gradient dither, it looks the same at every level, so no step shows.
 *
 * Uniforms: see RoomUniforms. Colours are unpremultiplied sRGB, as the gradients blended.
 */
export const ROOM_SKSL = `
uniform float2 light;
uniform float lightRadius;
uniform float2 washCentre;
uniform float washRadius;
uniform float3 ink;
uniform float3 accent;
uniform float pixelRatio;

float hash(float2 p) {
	float3 p3 = fract(p.xyx * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

half4 main(float2 p) {
	float l = ${LIGHT_PEAK} * (1.0 - smoothstep(0.0, 1.0, length(p - light) / lightRadius));
	float w = ${WASH_PEAK} * smoothstep(${WASH_START}, 1.0, length(p - washCentre) / washRadius);
	float3 c = mix(mix(ink, float3(1.0), l), accent, w);
	float2 px = floor(p * pixelRatio);
	float n = hash(px) + hash(px + float2(57.0, 113.0)) - 1.0;
	return half4(c + n / 255.0, 1.0);
}
`;

/** The room shader's uniforms by name, in ROOM_SKSL's declaration order */
export interface RoomUniforms {
	[name: string]: number | number[];
	/** Centre of the light pool (points) */
	light: number[];
	lightRadius: number;
	washCentre: number[];
	washRadius: number;
	/** The ink and the wash's accent colour, RGB 0..1 */
	ink: number[];
	accent: number[];
	/** Device pixels per point, so the noise varies per pixel rather than per point */
	pixelRatio: number;
}

/** How far (fraction of the room per radian of tilt) the light slides against the tilt */
const LIGHT_SLIDE = 0.6;

/** Where the light pool is centred in a `width` x `height` room, lit from a tilt in radians */
export function lightCentre(
	width: number,
	height: number,
	tiltX: number,
	tiltY: number,
): { x: number; y: number } {
	"worklet";
	return { x: width * (0.5 - tiltX * LIGHT_SLIDE), y: height * (0.3 - tiltY * LIGHT_SLIDE) };
}

/**
 * The room shader's uniforms for a `width` x `height` room lit from a tilt in radians
 * (`tiltX`, `tiltY`), in `ink` with its edges washed in `accent` (RGB or RGBA, 0..1)
 */
export function roomUniforms(
	width: number,
	height: number,
	tiltX: number,
	tiltY: number,
	ink: ArrayLike<number>,
	accent: ArrayLike<number>,
	pixelRatio: number,
): RoomUniforms {
	"worklet";
	const centre = lightCentre(width, height, tiltX, tiltY);
	return {
		light: [centre.x, centre.y],
		lightRadius: Math.max(width, height) * LIGHT_RADIUS,
		washCentre: [width / 2, height / 2],
		washRadius: Math.hypot(width, height) * WASH_RADIUS,
		ink: [ink[0], ink[1], ink[2]],
		accent: [accent[0], accent[1], accent[2]],
		pixelRatio,
	};
}

/**
 * How strongly the room is drawn again over the scene while the stage fades out (stage
 * opacity `opacity`, 0..1). Over the room, covering the scene with the room at 1 - opacity
 * gives exactly the scene at `opacity`, so the canvas can fade the stage itself; a
 * SurfaceView ignores the opacity of the views it sits in.
 */
export function stageCover(opacity: number): number {
	"worklet";
	return Math.min(1, Math.max(0, 1 - opacity));
}
