import type { Dot } from "../entities/Dot";

/**
 * Circle-circle overlap from centers and diameters, using distance-squared (no sqrt).
 * Legacy formula: distance = dx^2 + dy^2 - ((r1 + r2) / 2)^2, colliding when <= 0.
 */
export function circlesOverlap(
	ax: number,
	ay: number,
	aSize: number,
	bx: number,
	by: number,
	bSize: number,
): boolean {
	const dx = ax - bx;
	const dy = ay - by;
	const combinedRadius = (aSize + bSize) / 2;
	return dx * dx + dy * dy <= combinedRadius * combinedRadius;
}

/** Circle-circle collision between two dots at their current positions */
export function didCollide(a: Dot, b: Dot): boolean {
	return circlesOverlap(a.x, a.y, a.size, b.x, b.y, b.size);
}
