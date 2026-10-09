import type { DotView, RenderFrame } from "../domain/types";

/** A dot ready to draw: final on-screen position and radius for this rendered frame */
export interface SceneDot {
	x: number;
	y: number;
	radius: number;
	color: string;
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
 */
export function buildScene(
	frame: RenderFrame,
	alpha: number,
	player: { x: number; y: number },
): SceneDot[] {
	const frozen = frame.phase === "PAUSED" || frame.phase === "GAME_OVER";
	const moveT = frozen ? 0 : alpha;
	const sizeT = frozen ? 1 : alpha;
	const scene: SceneDot[] = [];
	let playerDot: DotView | undefined;

	for (const dot of frame.dots) {
		if (dot.kind === "player") {
			playerDot = dot;
			continue;
		}
		scene.push({
			x: dot.x + dot.vx * moveT,
			y: dot.y + dot.vy * moveT,
			radius: dot.prevRadius + (dot.radius - dot.prevRadius) * sizeT,
			color: dot.color,
		});
	}

	if (playerDot) {
		scene.push({ x: player.x, y: player.y, radius: playerDot.radius, color: playerDot.color });
	}

	return scene;
}
