import { GAME_COLORS } from "../domain/constants";
import type { DotView, RenderFrame } from "../domain/types";

/**
 * The drawable scene is a flat Float32Array with one record of SCENE_STRIDE floats per dot,
 * so one typed-array copy crosses to the UI thread per frame instead of an object per dot.
 */
export const SCENE_STRIDE = 5;
export const SCENE_X = 0;
export const SCENE_Y = 1;
export const SCENE_RADIUS = 2;
/** Index into GAME_COLORS */
export const SCENE_COLOR = 3;
/** One of the SCENE_KIND_* codes */
export const SCENE_KIND = 4;

export const SCENE_KIND_SMALL = 0;
export const SCENE_KIND_POINT = 1;
export const SCENE_KIND_PLAYER = 2;

function kindCode(kind: DotView["kind"]): number {
	if (kind === "player") return SCENE_KIND_PLAYER;
	return kind === "point" ? SCENE_KIND_POINT : SCENE_KIND_SMALL;
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
		let playerDot: DotView | undefined;
		for (const dot of frame.dots) {
			if (dot.kind === "player") {
				playerDot = dot;
				continue;
			}
			buffer[offset + SCENE_X] = dot.x + dot.vx * moveT;
			buffer[offset + SCENE_Y] = dot.y + dot.vy * moveT;
			buffer[offset + SCENE_RADIUS] = dot.prevRadius + (dot.radius - dot.prevRadius) * sizeT;
			buffer[offset + SCENE_COLOR] = colorIndex(dot.color);
			buffer[offset + SCENE_KIND] = kindCode(dot.kind);
			offset += SCENE_STRIDE;
		}

		if (playerDot) {
			buffer[offset + SCENE_X] = player.x;
			buffer[offset + SCENE_Y] = player.y;
			buffer[offset + SCENE_RADIUS] = playerDot.radius;
			buffer[offset + SCENE_COLOR] = colorIndex(playerDot.color);
			buffer[offset + SCENE_KIND] = SCENE_KIND_PLAYER;
			offset += SCENE_STRIDE;
		}

		return buffer.subarray(0, offset);
	};
}
