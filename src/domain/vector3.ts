import type { Vector3 } from "./types";

// Three-vector arithmetic in the phone's own axes. A gravity, a direction on the screen and a
// turn as an axis scaled by its angle are all one of these.

/** Turns smaller than this (radians) read as none, where the turn's axis is lost in rounding */
const NO_TURN = 1e-9;

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };

export function dot(a: Vector3, b: Vector3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vector3, b: Vector3): Vector3 {
	return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function lengthOf(v: Vector3): number {
	return Math.hypot(v.x, v.y, v.z);
}

export function scaled(v: Vector3, by: number): Vector3 {
	return { x: v.x * by, y: v.y * by, z: v.z * by };
}

export function plus(a: Vector3, b: Vector3): Vector3 {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** The same direction at unit length; zero stays zero */
export function unit(v: Vector3): Vector3 {
	const length = lengthOf(v);
	return length === 0 ? ZERO : scaled(v, 1 / length);
}

/** `v` without its part along the unit direction `along` */
export function without(v: Vector3, along: Vector3): Vector3 {
	return plus(v, scaled(along, -dot(v, along)));
}

/** `v` turned by `turn`, an axis scaled by its angle, right-handed (Rodrigues) */
export function rotated(v: Vector3, turn: Vector3): Vector3 {
	const angle = lengthOf(turn);
	if (angle < NO_TURN) return v;
	const axis = scaled(turn, 1 / angle);
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const k = cross(axis, v);
	const along = dot(axis, v) * (1 - c);
	return {
		x: v.x * c + k.x * s + axis.x * along,
		y: v.y * c + k.y * s + axis.y * along,
		z: v.z * c + k.z * s + axis.z * along,
	};
}

/**
 * The shortest turn taking direction `from` to `to`, as an axis scaled by its angle: none when
 * they agree, and a half turn about any axis square to `from` when they point straight apart
 */
export function turnBetween(from: Vector3, to: Vector3): Vector3 {
	const axis = cross(from, to);
	const sine = lengthOf(axis);
	const cosine = dot(from, to);
	if (sine > NO_TURN * lengthOf(from) * lengthOf(to)) {
		return scaled(axis, Math.atan2(sine, cosine) / sine);
	}
	if (cosine > 0) return ZERO;
	const square = unit(
		cross(from, Math.abs(from.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }),
	);
	return scaled(square, Math.PI);
}
