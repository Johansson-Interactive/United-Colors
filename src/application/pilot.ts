import { GAME_HERTZ, PLAYER_SPEED_PER_DEGREE } from "../domain/constants";
import { FLAT, gravityAt } from "../domain/levelPose";
import type { DotView, Gravity, RenderFrame, ScreenSize, TiltAngles } from "../domain/types";

/**
 * The pilot: a tilt that steers the player from what the frame shows, so the capture build
 * (built with EXPO_PUBLIC_CAPTURE=1; a shipped build never sets it) plays itself for the store
 * screenshots and the app preview. It heads for the nearest dot it may eat, leaning towards
 * point dots, keeps clear of the dots it may not, and holds the phone level off play, so the
 * settle bowl settles at once and Get ready's portal widens to the walls. The rules it plays by are the game's own:
 * it only reads frames and answers with a tilt, as the phone would.
 */

/** Player speed in px/s per radian of tilt at the default sensitivity (see PlayerDot) */
const SPEED_PER_RADIAN = (PLAYER_SPEED_PER_DEGREE * 180) / Math.PI;
/** How fast the pilot likes to roll (px/s): a brisk hand, not a flick */
const CRUISE = 440;
/** The most it will roll when a dot it may not eat is close */
const DASH = CRUISE * 1.4;
/** A point dot this much nearer in effect, so it goes for the five when both are near */
const POINT_PULL = 0.65;
/** It keeps clear of a wrong-colour dot within this many radii (the pair's, added) */
const CLEAR_RADII = 4.5;
/** How hard it pushes away from one, as a multiple of a dash */
const PUSH = 1.6;
/** Seconds ahead it reads a wrong-colour dot's position when keeping clear */
const CLEAR_LEAD_S = 0.3;
/** It keeps this many of its radii off the walls, where the drips come from */
const WALL_RADII = 3;
/** How hard it rolls back towards the middle of the field from its edges, as a fraction of cruise */
const MIDDLE_PULL = 0.3;
/** How much of the way to the wanted tilt a sample moves: a hand, not a switch */
const EASE = 0.35;

const LEVEL: TiltAngles = { x: 0, y: 0 };

/** A small dot that is loose on the field: not a drip forming on its wall, nor being refused */
function loose(dot: DotView): boolean {
	return !dot.drip && dot.reject === undefined && dot.absorb === undefined;
}

/** Where `dot` will be `seconds` from now, as it moves */
function ahead(dot: DotView, seconds: number): { x: number; y: number } {
	return { x: dot.x + dot.vx * GAME_HERTZ * seconds, y: dot.y + dot.vy * GAME_HERTZ * seconds };
}

/** How far from the path to a dot a wrong-colour dot may sit, in radii (the pair's, added) */
const PATH_RADII = 2;
/** What a dot costs to go for when a wrong-colour dot sits on the way */
const BLOCKED = 4;

/** How far `point` is from the segment `a`..`b` */
function distanceToSegment(
	point: { x: number; y: number },
	a: { x: number; y: number },
	b: { x: number; y: number },
): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length = dx * dx + dy * dy;
	const t = length
		? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
		: 0;
	return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/**
 * The velocity (px/s) the pilot wants from `frame`: towards the best dot to eat, pushed away
 * from the dots it must not touch; zero when there is nothing to do
 */
function wantedVelocity(frame: RenderFrame, screen: ScreenSize): { x: number; y: number } {
	const player = frame.dots.find((d) => d.kind === "player");
	if (!player) return { x: 0, y: 0 };
	const edible = (dot: DotView) => dot.kind === "point" || dot.color === player.color;
	// The wrong-colour dots a moment ahead, drips forming on the walls among them: a drip
	// can't end the run yet, but it shoots off at whatever sits in front of it
	const threats = frame.dots
		.filter((d) => d.kind === "small" && !edible(d) && d.reject === undefined)
		.map((d) => ({ ...ahead(d, CLEAR_LEAD_S), radius: d.drip?.radius ?? d.radius }));
	const field = frame.dots.filter((d) => d.kind !== "player" && loose(d));

	let best: { x: number; y: number } | null = null;
	let bestCost = Number.POSITIVE_INFINITY;
	for (const dot of field) {
		if (!edible(dot)) continue;
		// Meet it where it will be by the time the player gets there, unless the way is blocked
		const travel = Math.hypot(dot.x - player.x, dot.y - player.y) / CRUISE;
		const at = ahead(dot, travel);
		let cost =
			Math.hypot(at.x - player.x, at.y - player.y) * (dot.kind === "point" ? POINT_PULL : 1);
		for (const threat of threats) {
			if (distanceToSegment(threat, player, at) < PATH_RADII * (player.radius + threat.radius)) {
				cost *= BLOCKED;
				break;
			}
		}
		if (cost < bestCost) {
			bestCost = cost;
			best = at;
		}
	}

	let x = 0;
	let y = 0;
	if (best) {
		const dx = best.x - player.x;
		const dy = best.y - player.y;
		const distance = Math.hypot(dx, dy) || 1;
		x += (dx / distance) * CRUISE;
		y += (dy / distance) * CRUISE;
	}
	for (const threat of threats) {
		const dx = player.x - threat.x;
		const dy = player.y - threat.y;
		const distance = Math.hypot(dx, dy) || 1;
		const clear = CLEAR_RADII * (player.radius + threat.radius);
		if (distance < clear) {
			const weight = (clear - distance) / clear;
			x += (dx / distance) * weight * DASH * PUSH;
			y += (dy / distance) * weight * DASH * PUSH;
		}
	}
	// Off the walls and towards the middle, where there is room to get out of the way
	const margin = WALL_RADII * player.radius;
	const walls = [
		{ x: 1, y: 0, distance: player.x },
		{ x: -1, y: 0, distance: screen.width - player.x },
		{ x: 0, y: 1, distance: player.y },
		{ x: 0, y: -1, distance: screen.height - player.y },
	];
	for (const wall of walls) {
		if (wall.distance < margin) {
			const weight = (margin - wall.distance) / margin;
			x += wall.x * weight * DASH;
			y += wall.y * weight * DASH;
		}
	}
	x += ((screen.width / 2 - player.x) / (screen.width / 2)) * MIDDLE_PULL * CRUISE;
	y += ((screen.height / 2 - player.y) / (screen.height / 2)) * MIDDLE_PULL * CRUISE;
	const speed = Math.hypot(x, y);
	if (speed > DASH) {
		x *= DASH / speed;
		y *= DASH / speed;
	}
	return { x, y };
}

/**
 * The next tilt (from flat): level off play, otherwise eased from `previous` towards the tilt
 * that rolls the player at the velocity the pilot wants on `screen`, at `sensitivity` (the
 * speed setting)
 */
export function pilotStep(
	frame: RenderFrame,
	screen: ScreenSize,
	sensitivity: number,
	previous: TiltAngles,
): TiltAngles {
	if (frame.phase !== "RUNNING") return LEVEL;
	const wanted = wantedVelocity(frame, screen);
	const perRadian = SPEED_PER_RADIAN * sensitivity;
	const x = previous.x + (wanted.x / perRadian - previous.x) * EASE;
	const y = previous.y + (wanted.y / perRadian - previous.y) * EASE;
	return { x, y };
}

/**
 * A tilt source for the capture build: each call reads the state and the screen and answers
 * the next sample
 */
export function createPilot(
	getState: () => { frame: RenderFrame; settings: { tiltSensitivity: number } },
	getScreen: () => ScreenSize,
): () => Gravity {
	let previous = LEVEL;
	return () => {
		const { frame, settings } = getState();
		previous = pilotStep(frame, getScreen(), settings.tiltSensitivity, previous);
		return gravityAt(previous, FLAT.up);
	};
}
