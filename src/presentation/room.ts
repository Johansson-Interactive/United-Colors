/**
 * The room the dots live in, drawn by the game canvas under the scene: ink, a soft pool of
 * light that slides against the tilt as if the phone were lit from above, and an edge wash in
 * the accent colour. The pure parts are here; the paints are in GameCanvas.tsx.
 */

/** Stop positions for the eased ramps; enough that the curve reads smooth, not piecewise */
export const RAMP = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Light pool: bright centre easing out to nothing, no hard rim where a linear fade ends */
const LIGHT_PEAK = 0.075;
export const LIGHT_ALPHAS = RAMP.map((t) => LIGHT_PEAK * (1 - smoothstep(t)));
/** Light pool radius as a fraction of the room's longer side */
export const LIGHT_RADIUS = 0.95;

/** Edge wash: clear across the middle, easing in toward the corners */
const WASH_START = 0.55;
const WASH_PEAK = 0.26;
export const WASH_POSITIONS = [0, ...RAMP.map((t) => WASH_START + t * (1 - WASH_START))];
export const WASH_ALPHAS = [0, ...RAMP.map((t) => WASH_PEAK * smoothstep(t))];
/** Wash radius as a fraction of the room's diagonal */
export const WASH_RADIUS = 0.55;

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
 * How strongly the room is drawn again over the scene while the stage fades out (stage
 * opacity `opacity`, 0..1). Over the room, covering the scene with the room at 1 - opacity
 * gives exactly the scene at `opacity`, so the canvas can fade the stage itself; a
 * SurfaceView ignores the opacity of the views it sits in.
 */
export function stageCover(opacity: number): number {
	"worklet";
	return Math.min(1, Math.max(0, 1 - opacity));
}
