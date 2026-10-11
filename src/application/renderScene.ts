import { ABSORB_MERGE_FRACTION, GAME_COLORS } from "../domain/constants";
import type { DotView, RenderFrame } from "../domain/types";
import { createJelly, JELLY_MAX_STRETCH } from "./jelly";
import { leanReach } from "./lean";
import {
	REJECT_PRESS_DEPTH,
	REJECT_RECOIL,
	REJECT_SQUASH,
	rejectPenetration,
	rejectPush,
	rejectRecoil,
} from "./rejection";

/**
 * The drawable scene is a flat Float32Array with one record of SCENE_STRIDE floats per dot,
 * so one typed-array copy crosses to the UI thread per frame instead of an object per dot.
 */
export const SCENE_STRIDE = 13;
export const SCENE_X = 0;
export const SCENE_Y = 1;
export const SCENE_RADIUS = 2;
/** Index into GAME_COLORS */
export const SCENE_COLOR = 3;
/** One of the SCENE_KIND_* codes */
export const SCENE_KIND = 4;
/** For SCENE_KIND_MERGING dots: how far the slide into the player has come, 0..1 */
export const SCENE_MERGE = 5;
/**
 * For the player: its liquid stretch vector and wobble clock (see jelly.ts). For a point
 * dot: its lean toward the player as a stretch vector (see lean.ts). 0 otherwise.
 */
export const SCENE_STRETCH_X = 6;
export const SCENE_STRETCH_Y = 7;
export const SCENE_WOBBLE = 8;
/**
 * For a SCENE_KIND_REJECTED dot: how soft the dent it presses into the player is, 1 while it
 * presses and falling to 0 as it is pushed clear (so no dent is left once it is out)
 */
export const SCENE_DENT = 9;
/**
 * For a point dot: the GAME_COLORS index of its yolk, the colour the player turns into on
 * catching it, while its shell (SCENE_COLOR) is the player's own colour; -1 for no yolk
 */
export const SCENE_CORE = 10;
/**
 * For a point dot: where its yolk sits, as an offset (px) from the dot's centre before the
 * lean stretches it; 0 otherwise
 */
export const SCENE_CORE_X = 11;
export const SCENE_CORE_Y = 12;

export const SCENE_KIND_SMALL = 0;
export const SCENE_KIND_POINT = 1;
export const SCENE_KIND_PLAYER = 2;
/** A caught dot sliding into the player; drawn as one liquid body with it */
export const SCENE_KIND_MERGING = 3;
/** The wrong-colour dot the player is refusing; it dents the player's liquid */
export const SCENE_KIND_REJECTED = 4;

/** The player may swell to at most this multiple of its radius while taking dots in */
export const MERGE_SWELL_MAX = 1.3;
/** A merging dot has shrunk to this fraction of its radius by the time it reaches the player */
const MERGE_SHRINK = 0.55;
/** A point dot's yolk radius relative to the dot's */
export const YOLK_RADIUS = 0.5;
/** The yolk is drawn this share of the way from the dot's centre to its rim, toward the player */
export const YOLK_PULL = 0.7;

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

/**
 * Combine two stretches (long-axis vectors, see jelly.ts), capped at the most the shader's
 * bounds allow for. A stretch along u is the same as along -u, so they add with their angles
 * doubled: two along the same axis add up, and two at right angles cancel.
 */
export function addStretches(ax: number, ay: number, bx: number, by: number): [number, number] {
	const doubled = (x: number, y: number): [number, number] => {
		const e = Math.hypot(x, y);
		return e > 0 ? [(x * x - y * y) / e, (2 * x * y) / e] : [0, 0];
	};
	const [a2x, a2y] = doubled(ax, ay);
	const [b2x, b2y] = doubled(bx, by);
	const sx = a2x + b2x;
	const sy = a2y + b2y;
	const e = Math.min(JELLY_MAX_STRETCH, Math.hypot(sx, sy));
	if (e <= 0) return [0, 0];
	const angle = Math.atan2(sy, sx) / 2;
	return [Math.cos(angle) * e, Math.sin(angle) * e];
}

/** Zero the fields only the player, a point dot or a refused dot use */
function clearExtraFields(buffer: Float32Array, offset: number): void {
	buffer[offset + SCENE_STRETCH_X] = 0;
	buffer[offset + SCENE_STRETCH_Y] = 0;
	buffer[offset + SCENE_WOBBLE] = 0;
	buffer[offset + SCENE_DENT] = 0;
	buffer[offset + SCENE_CORE] = -1;
	buffer[offset + SCENE_CORE_X] = 0;
	buffer[offset + SCENE_CORE_Y] = 0;
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
 * - A point dot is drawn as a yolk: a shell in the player's colour, since it is safe to catch
 *   like any dot of that colour, round a core in the colour it turns the player into. The
 *   yolk is drawn to the player wherever they are; as they near, the whole dot leans toward
 *   them too, its back edge held still (see lean.ts).
 * - A refused wrong-colour dot presses into the player along the line from the player
 *   through it and is pushed back out, while the player squashes across that line and then
 *   recoils the other way (see rejection.ts).
 * - The player is drawn at its live position (moved every frame) and always last (on top),
 *   with the liquid shape its movement over the last `dtMs` gives it.
 * - When the simulation is frozen (paused / game over) dots are drawn exactly as simulated.
 *
 * The backing buffer is reused and grown as needed, but every call returns a new view on it:
 * worklets caches serialized values by object identity, so handing the same view to a
 * shared value twice would send the first frame's copy again.
 */
export function createSceneBuilder() {
	let buffer = new Float32Array(0);
	const jelly = createJelly();

	return function buildScene(
		frame: RenderFrame,
		alpha: number,
		player: { x: number; y: number },
		dtMs = 0,
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
		// Where the player is drawn: its live position, less any recoil from a refused dot
		let playerX = player.x;
		let playerY = player.y;
		// Squash from a refused dot pressing in: long axis across the hit, 0 when none
		let squashX = 0;
		let squashY = 0;

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
				clearExtraFields(buffer, offset);
				if (playerDot && playerDot.radius > 0) {
					const ratio = radius / playerDot.radius;
					swell += ratio * ratio * mergeSwell(absorb);
				}
			} else if (dot.reject !== undefined) {
				const prev = dot.prevReject ?? dot.reject;
				const reject = prev + (dot.reject - prev) * sizeT;
				// The line from the player through the dot, along which it presses in and out
				const dx = dot.x - player.x;
				const dy = dot.y - player.y;
				const distance = Math.hypot(dx, dy);
				const nx = distance > 1e-6 ? dx / distance : 1;
				const ny = distance > 1e-6 ? dy / distance : 0;
				const playerRadius = playerDot?.radius ?? 0;
				const touching = playerRadius + radius;
				const depth = rejectPenetration(reject, touching - distance, radius);
				buffer[offset + SCENE_X] = player.x + nx * (touching - depth);
				buffer[offset + SCENE_Y] = player.y + ny * (touching - depth);
				buffer[offset + SCENE_RADIUS] = radius;
				buffer[offset + SCENE_KIND] = SCENE_KIND_REJECTED;
				buffer[offset + SCENE_MERGE] = 0;
				clearExtraFields(buffer, offset);
				buffer[offset + SCENE_DENT] = 1 - rejectPush(reject);
				const press = Math.min(1, Math.max(0, depth / (radius * REJECT_PRESS_DEPTH)));
				squashX -= ny * REJECT_SQUASH * press;
				squashY += nx * REJECT_SQUASH * press;
				const recoil = playerRadius * REJECT_RECOIL * rejectRecoil(reject);
				playerX -= nx * recoil;
				playerY -= ny * recoil;
			} else {
				const x = dot.x + dot.vx * moveT;
				const y = dot.y + dot.vy * moveT;
				buffer[offset + SCENE_X] = x;
				buffer[offset + SCENE_Y] = y;
				buffer[offset + SCENE_RADIUS] = radius;
				buffer[offset + SCENE_KIND] = kindCode(dot.kind);
				buffer[offset + SCENE_MERGE] = 0;
				clearExtraFields(buffer, offset);
				if (dot.kind === "point" && playerDot && radius > 0) {
					buffer[offset + SCENE_COLOR] = colorIndex(playerDot.color);
					buffer[offset + SCENE_CORE] = colorIndex(dot.color);
					const dx = player.x - x;
					const dy = player.y - y;
					const distance = Math.hypot(dx, dy);
					const nx = distance > 1e-6 ? dx / distance : 0;
					const ny = distance > 1e-6 ? dy / distance : 0;
					const pull = radius * (1 - YOLK_RADIUS) * YOLK_PULL;
					buffer[offset + SCENE_CORE_X] = nx * pull;
					buffer[offset + SCENE_CORE_Y] = ny * pull;
					const reach = leanReach(distance - playerDot.radius - radius, playerDot.radius, radius);
					if (reach > 0) {
						// Stretched along the lean, the tip moves out by twice the centre's shift
						buffer[offset + SCENE_X] = x + (nx * reach) / 2;
						buffer[offset + SCENE_Y] = y + (ny * reach) / 2;
						buffer[offset + SCENE_STRETCH_X] = (nx * reach) / (2 * radius);
						buffer[offset + SCENE_STRETCH_Y] = (ny * reach) / (2 * radius);
					}
				}
			}
			offset += SCENE_STRIDE;
		}

		if (playerDot) {
			const shape = jelly(playerX, playerY, playerDot.radius, frozen ? 0 : dtMs);
			buffer[offset + SCENE_X] = playerX;
			buffer[offset + SCENE_Y] = playerY;
			buffer[offset + SCENE_RADIUS] =
				playerDot.radius * Math.min(MERGE_SWELL_MAX, Math.sqrt(1 + swell));
			buffer[offset + SCENE_COLOR] = colorIndex(playerDot.color);
			buffer[offset + SCENE_KIND] = SCENE_KIND_PLAYER;
			buffer[offset + SCENE_MERGE] = 0;
			const [stretchX, stretchY] = addStretches(shape.stretchX, shape.stretchY, squashX, squashY);
			buffer[offset + SCENE_STRETCH_X] = stretchX;
			buffer[offset + SCENE_STRETCH_Y] = stretchY;
			buffer[offset + SCENE_WOBBLE] = shape.wobble;
			buffer[offset + SCENE_DENT] = 0;
			buffer[offset + SCENE_CORE] = -1;
			buffer[offset + SCENE_CORE_X] = 0;
			buffer[offset + SCENE_CORE_Y] = 0;
			offset += SCENE_STRIDE;
		}

		return buffer.subarray(0, offset);
	};
}
