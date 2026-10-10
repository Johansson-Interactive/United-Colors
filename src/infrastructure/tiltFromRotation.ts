/**
 * How far past vertical (sine of the angle, here 30 degrees) the screen must turn before the
 * other side counts, so a phone held near upright doesn't flip back and forth.
 */
const TURN_OVER = 0.5;

export interface RotationTilt {
	x: number;
	y: number;
	/** Which way the screen faced; pass it back in with the next sample */
	facingDown: boolean;
}

/**
 * Player tilt (radians) from the device rotation Expo reports. Both platforms give Z-X-Y Euler
 * angles (`beta` about the screen's x axis in [-pi/2, pi/2], `gamma` about its y axis in
 * [-pi, pi]), so a phone held screen down (say, overhead in bed) sits at gamma near +-pi,
 * where the raw angle wraps.
 *
 * Instead, tilt is measured from flat on the side the screen faces. Screen up this is gamma
 * (exactly) and beta (to within a hair once both are tilted), so readings and saved level
 * poses carry over. Screen down both axes are mirrored, so tipping an edge toward or away
 * from you steers the way it does screen up. Each side reads smoothly past vertical; the
 * switch waits until the screen is well over (see TURN_OVER).
 */
export function tiltFromRotation(
	beta: number,
	gamma: number,
	wasFacingDown: boolean,
): RotationTilt {
	// Gravity in device coordinates (x right, y up, z out of the screen), as a unit vector
	const gx = Math.cos(beta) * Math.sin(gamma);
	const gy = -Math.sin(beta);
	const gz = -Math.cos(beta) * Math.cos(gamma);
	const facingDown = wasFacingDown ? gz > -TURN_OVER : gz > TURN_OVER;
	return facingDown
		? { x: Math.atan2(-gx, gz), y: Math.atan2(gy, gz), facingDown }
		: { x: Math.atan2(gx, -gz), y: Math.atan2(-gy, -gz), facingDown };
}
