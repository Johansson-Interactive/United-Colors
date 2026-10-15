import type { Corners, ScreenSize, WallContact } from "./types";

/**
 * The shape the dots live in: the screen, its four corners rounded the way the phone's glass
 * is (see Corners). Small dots bounce off the curve, the player slides round it, and nothing
 * spawns in it; the presentation draws the same curve.
 *
 * A corner is described in its own frame: the corner of the screen at the origin, `u` along
 * one edge and `v` along the other, both into the screen. The curve runs from the first
 * edge, `extent` from the corner, to the second, meeting each edge without a kink.
 */

/** A cubic Bézier in a corner's frame: from, two control points, to (u, v pairs) */
export type CornerCubic = readonly [number, number, number, number, number, number, number, number];

/**
 * iOS's continuous corner for a radius of 1, reverse-engineered from UIKit (the squircle-like
 * corner it draws screens and icons with): three cubics reaching 1.5287 along each edge.
 */
const CONTINUOUS: readonly CornerCubic[] = [
	[1.52866483, 0, 1.08849323, 0, 0.86840689, 0, 0.66993427, 0.065496],
	[0.66993427, 0.065496, 0.37282392, 0.16890025, 0.16890056, 0.37282413, 0.065496, 0.66993427],
	[0.065496, 0.66993427, 0, 0.86840701, 0, 1.08849299, 0, 1.52866483],
];
/** A quarter circle of radius 1 as one cubic */
const KAPPA = 0.5522847498;
const CIRCULAR: readonly CornerCubic[] = [[1, 0, 1 - KAPPA, 0, 0, 1 - KAPPA, 0, 1]];

/** How far each curve reaches along its edges, per unit radius */
const REACH: Record<Corners["curve"], number> = { continuous: 1.52866483, circular: 1 };

/** Points tried along each cubic for the nearest point, before Newton's method closes in on it */
const SAMPLES_PER_CUBIC = 12;
const NEWTON_STEPS = 4;

/** The corners as drawn on this screen: no larger than fits, two to an edge */
function fittedRadius(screen: ScreenSize): number {
	const corners = screen.corners;
	if (!corners || corners.radius <= 0) return 0;
	const room = Math.min(screen.width, screen.height) / 2;
	return Math.min(corners.radius, room / REACH[corners.curve]);
}

/** How far the corner curve reaches along each edge from the corner; 0 for square corners */
export function cornerExtent(screen: ScreenSize): number {
	const corners = screen.corners;
	return corners ? fittedRadius(screen) * REACH[corners.curve] : 0;
}

/** The corner curve on this screen, in a corner's frame, as cubics; none for square corners */
export function cornerCubics(screen: ScreenSize): CornerCubic[] {
	const radius = fittedRadius(screen);
	if (!screen.corners || radius === 0) return [];
	const unit = screen.corners.curve === "continuous" ? CONTINUOUS : CIRCULAR;
	return unit.map((c) => c.map((value) => value * radius) as unknown as CornerCubic);
}

/** The corner curve's cubics for the last screen asked about, flat, so the bounce never rebuilds them */
let cached: { key: string; cubics: CornerCubic[] } | null = null;

function cubicsFor(screen: ScreenSize): CornerCubic[] {
	const key = `${screen.corners?.curve}:${fittedRadius(screen)}`;
	if (cached?.key !== key) cached = { key, cubics: cornerCubics(screen) };
	return cached.cubics;
}

/** A point on cubic `c` at `t`, its first and second derivatives, into `out` (9 numbers) */
function evalCubic(c: CornerCubic, t: number, out: number[]): void {
	const m = 1 - t;
	for (let axis = 0; axis < 2; axis++) {
		const p0 = c[axis];
		const p1 = c[axis + 2];
		const p2 = c[axis + 4];
		const p3 = c[axis + 6];
		out[axis] = m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
		out[axis + 2] = 3 * (m * m * (p1 - p0) + 2 * m * t * (p2 - p1) + t * t * (p3 - p2));
		out[axis + 4] = 6 * (m * (p2 - 2 * p1 + p0) + t * (p3 - 2 * p2 + p1));
	}
}

const scratch = [0, 0, 0, 0, 0, 0];

/**
 * The nearest point on the curve to (`u`, `v`) in a corner's frame, the inward unit normal
 * there, and the signed distance to it: positive on the screen's side of the curve. The
 * nearest of a few samples, closed in on with Newton's method, so the normal is true to the
 * curve even from near its centre of curvature, where many points are almost as near.
 */
function nearestOnCurve(cubics: CornerCubic[], u: number, v: number) {
	let bestCubic = 0;
	let bestT = 0;
	let best = Number.POSITIVE_INFINITY;
	cubics.forEach((c, i) => {
		for (let s = 0; s <= SAMPLES_PER_CUBIC; s++) {
			const t = s / SAMPLES_PER_CUBIC;
			evalCubic(c, t, scratch);
			const d2 = (scratch[0] - u) ** 2 + (scratch[1] - v) ** 2;
			if (d2 < best) {
				best = d2;
				bestCubic = i;
				bestT = t;
			}
		}
	});
	const c = cubics[bestCubic];
	let t = bestT;
	for (let step = 0; step < NEWTON_STEPS; step++) {
		evalCubic(c, t, scratch);
		const du = scratch[0] - u;
		const dv = scratch[1] - v;
		const f = du * scratch[2] + dv * scratch[3];
		const df = scratch[2] ** 2 + scratch[3] ** 2 + du * scratch[4] + dv * scratch[5];
		if (df <= 0) break;
		t = Math.max(0, Math.min(1, t - f / df));
	}
	evalCubic(c, t, scratch);
	const qu = scratch[0];
	const qv = scratch[1];
	const tu = scratch[2];
	const tv = scratch[3];
	// The curve runs from the first edge round to the second, so the screen lies to the right
	// of its direction of travel: that says which side the point is on. The normal itself is
	// the line from the nearest point to the point.
	const side = (u - qu) * tv - (v - qv) * tu;
	const away = Math.hypot(u - qu, v - qv);
	let nu: number;
	let nv: number;
	if (away > 1e-9) {
		const sign = side >= 0 ? 1 : -1;
		nu = (sign * (u - qu)) / away;
		nv = (sign * (v - qv)) / away;
	} else {
		const tlen = Math.hypot(tu, tv) || 1;
		nu = tv / tlen;
		nv = -tu / tlen;
	}
	const distance = (u - qu) * nu + (v - qv) * nv;
	return { qu, qv, nu, nv, distance };
}

/**
 * The walls within `reach` of (`x`, `y`): each as its inward unit normal and the nearest
 * point on it (a foot). In a corner that is the curve alone, with its normal where it is
 * nearest; elsewhere the straight edges, two at most. A centre past a wall counts too, so a
 * dot that has overshot is always pushed back in.
 */
export function arenaContacts(
	screen: ScreenSize,
	x: number,
	y: number,
	reach: number,
): WallContact[] {
	const { width, height } = screen;
	const extent = cornerExtent(screen);
	if (extent > 0) {
		// Which corner (if any) the point is in, and its frame: u along the top or bottom edge
		const right = x > width / 2;
		const bottom = y > height / 2;
		const u = right ? width - x : x;
		const v = bottom ? height - y : y;
		if (u < extent && v < extent) {
			const { qu, qv, nu, nv, distance } = nearestOnCurve(cubicsFor(screen), u, v);
			if (distance >= reach) return [];
			const sx = right ? -1 : 1;
			const sy = bottom ? -1 : 1;
			return [
				{
					nx: nu * sx,
					ny: nv * sy,
					x: right ? width - qu : qu,
					y: bottom ? height - qv : qv,
				},
			];
		}
	}
	const contacts: WallContact[] = [];
	if (x < reach) contacts.push({ nx: 1, ny: 0, x: 0, y });
	else if (width - x < reach) contacts.push({ nx: -1, ny: 0, x: width, y });
	if (y < reach) contacts.push({ nx: 0, ny: 1, x, y: 0 });
	else if (height - y < reach) contacts.push({ nx: 0, ny: -1, x, y: height });
	return contacts;
}

/**
 * Where a circle of `radius` centred at (`x`, `y`) ends up held inside the arena: pushed out
 * of each wall it crosses along that wall's normal, so it keeps its movement along the wall
 * and slides round a corner rather than sticking in it
 */
export function holdInside(
	screen: ScreenSize,
	x: number,
	y: number,
	radius: number,
): { x: number; y: number } {
	let px = x;
	let py = y;
	// A push out of one wall can carry the circle into another (in a corner): a few rounds settle it
	for (let round = 0; round < 8; round++) {
		const contacts = arenaContacts(screen, px, py, radius);
		if (contacts.length === 0) break;
		for (const wall of contacts) {
			const depth = radius - ((px - wall.x) * wall.nx + (py - wall.y) * wall.ny);
			if (depth > 0) {
				px += wall.nx * depth;
				py += wall.ny * depth;
			}
		}
	}
	return { x: px, y: py };
}
