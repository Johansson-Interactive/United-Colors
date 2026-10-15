import { arenaContacts } from "../domain/arena";
import { ABSORB_MERGE_FRACTION, GAME_COLORS } from "../domain/constants";
import { dripCircle } from "../domain/engine/Drip";
import type { DotView, RenderFrame, ScreenSize, WallContact } from "../domain/types";
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
import {
	sceneLength,
	setDent,
	setMerge,
	setNeck,
	setStretch,
	setWall,
	setYolk,
	writeDot,
} from "./sceneRecord";
import {
	DRIP_NECK,
	DRIP_STRETCH,
	launchStretch,
	PLAYER_NECK,
	PLAYER_PRESS,
	pressDepth,
	pressedRadius,
	stepPress,
} from "./wall";

/**
 * Most caught dots drawn merging into the player at once: as many as the liquid body holds
 * besides the player (see mergeShader.ts). Past this, the dots caught last are left out
 * of the scene altogether, body, halo, glare and swell alike, until there is room.
 */
export const MERGE_MAX_DOTS = 8;
/** The player may swell to at most this multiple of its radius while taking dots in */
export const MERGE_SWELL_MAX = 1.3;
/** A merging dot has shrunk to this fraction of its radius by the time it reaches the player */
const MERGE_SHRINK = 0.55;
/** A point dot's yolk radius relative to the dot's */
export const YOLK_RADIUS = 0.5;
/** The yolk is drawn this share of the way from the dot's centre to its rim, toward the player */
export const YOLK_PULL = 0.7;

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

/** Where the player is this frame, and how hard they push into the walls (see GameEngine.getPlayerPush) */
export interface PlayerPose {
	x: number;
	y: number;
	/** Velocity (px/s) the walls hold back, pointing into them; 0 when free */
	pushX?: number;
	pushY?: number;
}

/** Whether `dot` is a caught dot sliding into the player */
function isMerging(dot: DotView): boolean {
	return dot.kind !== "player" && dot.absorb !== undefined;
}

/**
 * The caught dots to draw merging when more are merging than the body holds: those furthest
 * along, so the one left out is a dot just caught rather than one already sliding in (ties go
 * to the earlier dot in the frame). Null when every caught dot fits, which is counted without
 * allocating since it is every frame of normal play.
 */
function mergingWithinCap(dots: readonly DotView[]): Set<DotView> | null {
	let count = 0;
	for (const d of dots) if (isMerging(d)) count++;
	if (count <= MERGE_MAX_DOTS) return null;
	const furthest = dots.filter(isMerging).sort((a, b) => (b.absorb ?? 0) - (a.absorb ?? 0));
	return new Set(furthest.slice(0, MERGE_MAX_DOTS));
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
 *   as they go, and the player swells by the volume it takes in before settling back. At most
 *   MERGE_MAX_DOTS are drawn at once (see mergingWithinCap).
 * - A point dot is drawn as a yolk: a shell in the player's colour, since it is safe to catch
 *   like any dot of that colour, round a core in the colour it turns the player into. The
 *   yolk is drawn to the player wherever they are; as they near, the whole dot leans toward
 *   them too, its back edge held still (see lean.ts).
 * - A refused wrong-colour dot presses into the player along the line from the player
 *   through it and is pushed back out, while the player squashes across that line and then
 *   recoils the other way (see rejection.ts).
 * - A drip forming on a wall is drawn where the simulation has it, from the interpolated
 *   progress (see Drip.ts), joined to the wall by a wet fillet and swelling forward, drawn
 *   out, along the heading it will shoot off on. Once it lets go it stays joined to the wall
 *   while it tears free, rounding up as it goes (see wall.ts).
 * - The player is drawn at its live position (moved every frame),
 *   with the liquid shape its movement over the last `dtMs` gives it. Pushed into a wall
 *   (given the `screen`), it presses into it as hard as it pushes, with a wet fillet, and
 *   eases back as the push lets up or it pulls away.
 * - When the simulation is frozen (paused / game over) dots are drawn exactly as simulated.
 *
 * The backing buffer is reused and grown as needed, but every call returns a new view on it:
 * worklets caches serialized values by object identity, so handing the same view to a
 * shared value twice would send the first frame's copy again.
 */
export function createSceneBuilder() {
	let buffer = new Float32Array(0);
	const jelly = createJelly();
	// The player's push into the walls, smoothed (px/s, pointing into them)
	let pressX = 0;
	let pressY = 0;
	// Scratch for a forming drip's pose
	const dripPose = { x: 0, y: 0, radius: 0 };

	return function buildScene(
		frame: RenderFrame,
		alpha: number,
		player: PlayerPose,
		dtMs = 0,
		screen: ScreenSize | null = null,
	): Float32Array {
		const frozen = frame.phase === "PAUSED" || frame.phase === "GAME_OVER";
		const moveT = frozen ? 0 : alpha;
		const sizeT = frozen ? 1 : alpha;
		const needed = sceneLength(frame.dots.length);
		if (buffer.length < needed) buffer = new Float32Array(needed);

		let n = 0;
		const playerDot = frame.dots.find((d) => d.kind === "player");
		const withinCap = mergingWithinCap(frame.dots);
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
			if (withinCap && isMerging(dot) && !withinCap.has(dot)) continue;
			const radius = dot.prevRadius + (dot.radius - dot.prevRadius) * sizeT;
			const color = colorIndex(dot.color);
			if (dot.absorb !== undefined) {
				const prev = dot.prevAbsorb ?? dot.absorb;
				const absorb = prev + (dot.absorb - prev) * sizeT;
				const slide = mergeSlide(absorb);
				const x = dot.x + (player.x - dot.x) * slide;
				const y = dot.y + (player.y - dot.y) * slide;
				const shrunk = radius * (1 - (1 - MERGE_SHRINK) * slide);
				writeDot(buffer, n, "merging", x, y, shrunk, color);
				setMerge(buffer, n, slide);
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
				const x = player.x + nx * (touching - depth);
				const y = player.y + ny * (touching - depth);
				writeDot(buffer, n, "rejected", x, y, radius, color);
				setDent(buffer, n, 1 - rejectPush(reject));
				const press = Math.min(1, Math.max(0, depth / (radius * REJECT_PRESS_DEPTH)));
				squashX -= ny * REJECT_SQUASH * press;
				squashY += nx * REJECT_SQUASH * press;
				const recoil = playerRadius * REJECT_RECOIL * rejectRecoil(reject);
				playerX -= nx * recoil;
				playerY -= ny * recoil;
			} else if (dot.drip) {
				const { wall, heading } = dot.drip;
				// The same pose the engine catches it at (see SmallDot.circleAt)
				const { prev, progress } = dot.drip;
				dripCircle(wall, heading, dot.drip.radius, prev, progress, sizeT, dripPose);
				writeDot(buffer, n, "small", dripPose.x, dripPose.y, dripPose.radius, color);
				setStretch(buffer, n, heading.vx * DRIP_STRETCH, heading.vy * DRIP_STRETCH);
				setWall(buffer, n, 0, wall);
				setNeck(buffer, n, dot.drip.radius * DRIP_NECK);
			} else {
				const x = dot.x + dot.vx * moveT;
				const y = dot.y + dot.vy * moveT;
				if (dot.kind === "point" && playerDot && radius > 0) {
					const dx = player.x - x;
					const dy = player.y - y;
					const distance = Math.hypot(dx, dy);
					const nx = distance > 1e-6 ? dx / distance : 0;
					const ny = distance > 1e-6 ? dy / distance : 0;
					const reach = leanReach(distance - playerDot.radius - radius, playerDot.radius, radius);
					// Stretched along the lean, the tip moves out by twice the centre's shift
					const shift = Math.max(0, reach) / 2;
					writeDot(
						buffer,
						n,
						"point",
						x + nx * shift,
						y + ny * shift,
						radius,
						colorIndex(playerDot.color),
					);
					const pull = radius * (1 - YOLK_RADIUS) * YOLK_PULL;
					setYolk(buffer, n, color, nx * pull, ny * pull);
					if (reach > 0)
						setStretch(buffer, n, (nx * reach) / (2 * radius), (ny * reach) / (2 * radius));
				} else {
					writeDot(buffer, n, dot.kind, x, y, radius, color);
				}
				if (dot.launch) {
					const { wall } = dot.launch;
					const progress = dot.launch.prev + (dot.launch.progress - dot.launch.prev) * sizeT;
					const stretch = launchStretch(progress);
					// Along the heading; a frozen frame reports none, so then straight off the wall
					const speed = Math.hypot(dot.vx, dot.vy);
					const ux = speed > 1e-6 ? dot.vx / speed : wall.nx;
					const uy = speed > 1e-6 ? dot.vy / speed : wall.ny;
					setStretch(buffer, n, ux * stretch, uy * stretch);
					setWall(buffer, n, 0, wall);
					setNeck(buffer, n, radius * DRIP_NECK);
				}
			}
			n++;
		}

		const step = frozen ? 0 : dtMs;
		pressX = stepPress(pressX, player.pushX ?? 0, step);
		pressY = stepPress(pressY, player.pushY ?? 0, step);

		if (playerDot) {
			const shape = jelly(playerX, playerY, playerDot.radius, step);
			let radius = playerDot.radius * Math.min(MERGE_SWELL_MAX, Math.sqrt(1 + swell));
			// Pressed into each wall the push points into: the body sinks in as hard as it is
			// pushed, less any gap that has opened as the player pulls away
			const pressed: WallContact[] = [];
			let deepest = 0;
			if (screen && playerDot.radius > 0) {
				const r = playerDot.radius;
				// The walls near enough to press into: straight edges, or a rounded corner's curve
				// at its slant where the player meets it (see arena.ts)
				const walls: Array<{ wall: WallContact; push: number }> = [];
				for (const wall of arenaContacts(screen, playerX, playerY, r * (1 + PLAYER_PRESS))) {
					const push = -(pressX * wall.nx + pressY * wall.ny);
					if (push > 0) walls.push({ wall, push });
				}
				for (const { wall, push } of walls) {
					const gap = (playerX - wall.x) * wall.nx + (playerY - wall.y) * wall.ny - r;
					const depth = pressDepth(push, r) - Math.max(0, gap);
					if (depth <= 0) continue;
					playerX -= wall.nx * depth;
					playerY -= wall.ny * depth;
					pressed.push(wall);
					deepest = Math.max(deepest, depth);
				}
				if (deepest > 0) radius = pressedRadius(radius, deepest);
			}
			writeDot(buffer, n, "player", playerX, playerY, radius, colorIndex(playerDot.color));
			const [stretchX, stretchY] = addStretches(shape.stretchX, shape.stretchY, squashX, squashY);
			setStretch(buffer, n, stretchX, stretchY, shape.wobble);
			pressed.forEach((wall, slot) => {
				setWall(buffer, n, slot === 0 ? 0 : 1, wall);
			});
			if (deepest > 0) {
				const r = playerDot.radius;
				setNeck(buffer, n, r * PLAYER_NECK * (deepest / (r * PLAYER_PRESS)));
			}
			n++;
		}

		return buffer.subarray(0, sceneLength(n));
	};
}
