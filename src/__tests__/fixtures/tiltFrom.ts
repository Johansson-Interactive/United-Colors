import { FLAT_GRAVITY, levelPoseAt, TILT_START, tiltOf } from "../../domain/tilt";
import type { Gravity, TiltAngles } from "../../domain/types";
import { lengthOf, turnBetween, unit } from "../../domain/vector3";

/** The tilt `gravity` reads from a level pose taken where gravity read `pose`, with no swivel */
export function tiltFrom(gravity: Gravity, pose: Gravity = FLAT_GRAVITY): TiltAngles {
	return tiltOf({ ...TILT_START, pose: levelPoseAt(pose), gravity: unit(gravity) });
}

/** The angle between two directions (radians) */
export function angleBetween(a: Gravity, b: Gravity): number {
	return lengthOf(turnBetween(unit(a), unit(b)));
}
