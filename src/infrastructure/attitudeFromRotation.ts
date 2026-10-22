import type { Attitude } from "../domain/types";

/**
 * Which way the phone faces in the room, from the device rotation Expo reports. Both platforms
 * give Z-X-Y Euler angles: `alpha` a turn about the room's vertical, then `beta` about the
 * phone's short (x) axis in [-pi/2, pi/2], then `gamma` about its long (y) axis in [-pi, pi].
 * The attitude is the rotation Rz(alpha) Rx(beta) Ry(gamma), whose columns are the phone's axes
 * in the room. iOS passes Core Motion's yaw, pitch and roll through; Android reads its rotation
 * vector with `SensorManager.getOrientation` and negates azimuth and pitch, so both describe the
 * same rotation. The angles wrap screen down and lose an axis upright, but the attitude they
 * describe never does.
 *
 * Alpha's sign: a growing alpha turns the phone counterclockwise seen from above (right-handed
 * about up). iOS: Core Motion's yaw is right-handed about its z-up reference frame. Android:
 * azimuth runs clockwise from north and Expo negates it. Read from the sources, not yet from a
 * device: confirm with one device log per platform (lay the phone flat, turn it
 * counterclockwise, alpha should grow) before trusting the swivel's sense.
 */
export function attitudeFromRotation(alpha: number, beta: number, gamma: number): Attitude {
	const ca = Math.cos(alpha);
	const sa = Math.sin(alpha);
	const cb = Math.cos(beta);
	const sb = Math.sin(beta);
	const cg = Math.cos(gamma);
	const sg = Math.sin(gamma);
	return {
		xx: ca * cg - sa * sb * sg,
		xy: sa * cg + ca * sb * sg,
		xz: -cb * sg,
		yx: -sa * cb,
		yy: ca * cb,
		yz: sb,
		zx: ca * sg + sa * sb * cg,
		zy: sa * sg - ca * sb * cg,
		zz: cb * cg,
	};
}
