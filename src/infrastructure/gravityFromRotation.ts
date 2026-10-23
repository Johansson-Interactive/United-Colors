import type { Gravity } from "../domain/types";

/**
 * Which way gravity points (unit, in the phone's axes: x right, y up the screen, z out of its
 * face), from the device rotation Expo reports. Both platforms give Z-X-Y Euler angles: `alpha`
 * a turn about the room's vertical, then `beta` about the phone's short (x) axis in
 * [-pi/2, pi/2], then `gamma` about its long (y) axis in [-pi, pi]. iOS passes Core Motion's
 * attitude through; Android reads its rotation vector with `SensorManager.getOrientation`, so
 * both describe the same rotation, fused with the gyroscope. The angles wrap screen down and
 * lose an axis upright, but the gravity they describe never does.
 *
 * Alpha, the player turning on the spot, never moves gravity, so it isn't read at all: tilt is
 * gravity alone (ADR 0014).
 */
export function gravityFromRotation(beta: number, gamma: number): Gravity {
	return {
		x: Math.cos(beta) * Math.sin(gamma),
		y: -Math.sin(beta),
		z: -Math.cos(beta) * Math.cos(gamma),
	};
}
