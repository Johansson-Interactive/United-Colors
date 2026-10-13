import { DRIP_HANG_MAX, DRIP_HANG_MIN, DRIP_LEAN } from "../constants";
import type { Circle, WallContact } from "../types";

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/**
 * How a drip forms on a wall, as curves of its progress 0..1 (see SmallDot). Both the
 * collision circle and the drawing take it from dripCircle, so a drip is caught where it is seen.
 */

/** The drip's radius as a fraction of its full radius: its area fills at a steady flow */
export function dripRadius(progress: number): number {
	return Math.sqrt(clamp01(progress));
}

/**
 * How far the drip's centre hangs from the wall, as a fraction of its radius: a bulge on the
 * wall at first, sagging faster as it fills, past flush just before it tears off
 */
export function dripHang(progress: number): number {
	const e = clamp01(progress);
	return DRIP_HANG_MIN + (DRIP_HANG_MAX - DRIP_HANG_MIN) * e * e;
}

/**
 * Where the drip's centre sits from its foot, as a fraction of its radius: out from the wall
 * (inward normal `nx`, `ny`) by dripHang, and along it toward its unit heading (`hx`, `hy`)
 * by DRIP_LEAN of the heading's slant along the wall. The lean holds from the first bead on,
 * so the drip swells forward along its heading. Written to `out` when given.
 */
export function dripOffset(
	progress: number,
	nx: number,
	ny: number,
	hx: number,
	hy: number,
	out: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
	const hang = dripHang(progress);
	const slant = hx * nx + hy * ny;
	out.x = nx * hang + (hx - slant * nx) * DRIP_LEAN;
	out.y = ny * hang + (hy - slant * ny) * DRIP_LEAN;
	return out;
}

/**
 * The drip hanging from its `wall`'s foot, growing to `fullRadius` and leaning toward its
 * unit `heading`, `t` (0..1) of the way from progress `prev` to `progress`: the pose the
 * drip is both caught and drawn at between ticks. Written to `out`, so it allocates nothing.
 */
export function dripCircle(
	wall: WallContact,
	heading: { vx: number; vy: number },
	fullRadius: number,
	prev: number,
	progress: number,
	t: number,
	out: Circle,
): Circle {
	const at = prev + (progress - prev) * t;
	const radius = fullRadius * dripRadius(at);
	dripOffset(at, wall.nx, wall.ny, heading.vx, heading.vy, out);
	out.x = wall.x + out.x * radius;
	out.y = wall.y + out.y * radius;
	out.radius = radius;
	return out;
}
