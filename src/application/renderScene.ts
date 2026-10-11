import { ABSORB_MERGE_FRACTION, GAME_COLORS } from "../domain/constants";
import type { DotView, RenderFrame } from "../domain/types";

/**
 * The drawable scene is a flat Float32Array with one record of SCENE_STRIDE floats per dot,
 * so one typed-array copy crosses to the UI thread per frame instead of an object per dot.
 */
export const SCENE_STRIDE = 6;
export const SCENE_X = 0;
export const SCENE_Y = 1;
export const SCENE_RADIUS = 2;
/** Index into GAME_COLORS */
export const SCENE_COLOR = 3;
/** One of the SCENE_KIND_* codes */
export const SCENE_KIND = 4;
/** For SCENE_KIND_MERGING dots: how far the slide into the player has come, 0..1 */
export const SCENE_MERGE = 5;

export const SCENE_KIND_SMALL = 0;
export const SCENE_KIND_POINT = 1;
export const SCENE_KIND_PLAYER = 2;
/** A caught dot sliding into the player; drawn as one liquid body with it */
export const SCENE_KIND_MERGING = 3;

/** The player may swell to at most this multiple of its radius while taking dots in */
export const MERGE_SWELL_MAX = 1.3;
/** A merging dot has shrunk to this fraction of its radius by the time it reaches the player */
const MERGE_SHRINK = 0.55;

function kindCode(kind: DotView["kind"]): number {
	if (kind === "player") return SCENE_KIND_PLAYER;
	return kind === "point" ? SCENE_KIND_POINT : SCENE_KIND_SMALL;
}

/**
 * How far along its slide into the player a caught dot is, 0..1, from its absorb progress
 * (0..1 over the whole absorb, of which the first ABSORB_MERGE_FRACTION is the slide).
 * Eases in: the dot starts slowly and is pulled in faster as it nears the player.
 */
export function mergeSlide(absorb: number): number {
	const m = Math.min(1, Math.max(0, absorb / ABSORB_MERGE_FRACTION));
	return m * m;
}

/**
 * How much of a caught dot's volume the player is carrying, 0..1, from its absorb progress.
 * Rises as the dot pushes in over the second half of the slide, peaks when it arrives, then
 * relaxes back to 0 over the rest of the absorb.
 */
export function mergeSwell(absorb: number): number {
	const f = ABSORB_MERGE_FRACTION;
	if (absorb < f) {
		const rise = Math.min(1, Math.max(0, (absorb - f / 2) / (f / 2)));
		return rise * rise * (3 - 2 * rise);
	}
	const relax = Math.min(1, (absorb - f) / (1 - f));
	const eased = 1 - (1 - relax) * (1 - relax);
	return 1 - eased;
}

function colorIndex(color: string): number {
	const index = (GAME_COLORS as readonly string[]).indexOf(color);
	return index < 0 ? 0 : index;
}

/**
 * Build the drawable scene for one rendered frame between simulation ticks.
 *
 * - Moving dots are extrapolated along their per-tick velocity by `alpha` (0..1, fraction of
 *   a tick elapsed since the last one). The simulation moves dots in straight lines and
 *   applies edge bounces after the move, so this lands exactly on the path between ticks:
 *   smooth with no added latency.
 * - Size animations (point dots) are interpolated from the previous tick, since
 *   extrapolating them would overshoot when a pulse reverses.
 * - Caught dots slide from where they were caught into the player's live position, shrinking
 *   as they go, and the player swells by the volume it takes in before settling back.
 * - The player is drawn at its live position (moved every frame) and always last (on top).
 * - When the simulation is frozen (paused / game over) dots are drawn exactly as simulated.
 *
 * The backing buffer is reused and grown as needed, but every call returns a new view on it:
 * worklets caches serialized values by object identity, so handing the same view to a
 * shared value twice would send the first frame's copy again.
 */
export function createSceneBuilder() {
	let buffer = new Float32Array(0);

	return function buildScene(
		frame: RenderFrame,
		alpha: number,
		player: { x: number; y: number },
	): Float32Array {
		const frozen = frame.phase === "PAUSED" || frame.phase === "GAME_OVER";
		const moveT = frozen ? 0 : alpha;
		const sizeT = frozen ? 1 : alpha;
		const needed = frame.dots.length * SCENE_STRIDE;
		if (buffer.length < needed) buffer = new Float32Array(needed);

		let offset = 0;
		const playerDot = frame.dots.find((d) => d.kind === "player");
		// Sum of (caught radius / player radius)^2 weighted by how much of each is in the player
		let swell = 0;
		for (const dot of frame.dots) {
			if (dot.kind === "player") continue;
			const radius = dot.prevRadius + (dot.radius - dot.prevRadius) * sizeT;
			buffer[offset + SCENE_COLOR] = colorIndex(dot.color);
			if (dot.absorb !== undefined) {
				const prev = dot.prevAbsorb ?? dot.absorb;
				const absorb = prev + (dot.absorb - prev) * sizeT;
				const slide = mergeSlide(absorb);
				buffer[offset + SCENE_X] = dot.x + (player.x - dot.x) * slide;
				buffer[offset + SCENE_Y] = dot.y + (player.y - dot.y) * slide;
				buffer[offset + SCENE_RADIUS] = radius * (1 - (1 - MERGE_SHRINK) * slide);
				buffer[offset + SCENE_KIND] = SCENE_KIND_MERGING;
				buffer[offset + SCENE_MERGE] = slide;
				if (playerDot && playerDot.radius > 0) {
					const ratio = radius / playerDot.radius;
					swell += ratio * ratio * mergeSwell(absorb);
				}
			} else {
				buffer[offset + SCENE_X] = dot.x + dot.vx * moveT;
				buffer[offset + SCENE_Y] = dot.y + dot.vy * moveT;
				buffer[offset + SCENE_RADIUS] = radius;
				buffer[offset + SCENE_KIND] = kindCode(dot.kind);
				buffer[offset + SCENE_MERGE] = 0;
			}
			offset += SCENE_STRIDE;
		}

		if (playerDot) {
			buffer[offset + SCENE_X] = player.x;
			buffer[offset + SCENE_Y] = player.y;
			buffer[offset + SCENE_RADIUS] =
				playerDot.radius * Math.min(MERGE_SWELL_MAX, Math.sqrt(1 + swell));
			buffer[offset + SCENE_COLOR] = colorIndex(playerDot.color);
			buffer[offset + SCENE_KIND] = SCENE_KIND_PLAYER;
			buffer[offset + SCENE_MERGE] = 0;
			offset += SCENE_STRIDE;
		}

		return buffer.subarray(0, offset);
	};
}
