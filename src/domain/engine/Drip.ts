import { DRIP_HANG_MAX, DRIP_HANG_MIN, DRIP_LEAN } from "../constants";

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/**
 * How a drip forms on a wall, as curves of its progress 0..1 (see SmallDot). Both the
 * collision circle and the drawing follow these, so a drip is caught where it is seen.
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
 * so the drip swells forward along its heading.
 */
export function dripOffset(
	progress: number,
	nx: number,
	ny: number,
	hx: number,
	hy: number,
): { x: number; y: number } {
	const hang = dripHang(progress);
	const out = hx * nx + hy * ny;
	return {
		x: nx * hang + (hx - out * nx) * DRIP_LEAN,
		y: ny * hang + (hy - out * ny) * DRIP_LEAN,
	};
}
