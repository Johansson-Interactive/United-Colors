import type { Gravity } from "../domain/types";

/**
 * Which way gravity points (unit, in the device's axes: x right, y up, z out of the screen),
 * from the device rotation Expo reports. Both platforms give Z-X-Y Euler angles (`beta` about
 * the screen's x axis in [-pi/2, pi/2], `gamma` about its y axis in [-pi, pi]): iOS passes Core
 * Motion's attitude through, Android reads its rotation vector the same way. The angles wrap
 * screen down and lose an axis upright, but the gravity they describe never does, so tilt is
 * measured from that (see levelPose.ts).
 */
export function gravityFromRotation(beta: number, gamma: number): Gravity {
	return {
		x: Math.cos(beta) * Math.sin(gamma),
		y: -Math.sin(beta),
		z: -Math.cos(beta) * Math.cos(gamma),
	};
}
