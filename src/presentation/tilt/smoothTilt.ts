/**
 * Pure following steps for the interface tilt. A follower chases its target exponentially, then
 * snaps onto it once the gap is below the eye's notice, so a phone at rest stops producing new
 * values and everything derived from the tilt can go quiet. The interface tilt follows the
 * sensor's (smoothTowards); a bowl's "down" follows the interface tilt, slower (see lean.ts).
 */

/** Fraction of the remaining distance the interface tilt closes per frame at 60 Hz */
export const SMOOTHING = 0.18;
/** Frame length the smoothing rate is stated for */
const REFERENCE_FRAME_MS = 1000 / 60;
/** The interface tilt's time constant (ms), SMOOTHING per reference frame */
const SMOOTH_MS = -REFERENCE_FRAME_MS / Math.log(1 - SMOOTHING);
/** Remaining distance (radians) under which the value snaps to the target instead of chasing it */
export const SNAP_RAD = 1e-4;

/**
 * Move `current` toward `target` for a frame of `dtMs`, closing all but 1/e of the gap every
 * `tauMs`; returns `target` itself once close
 */
export function followTowards(current: number, target: number, dtMs: number, tauMs: number) {
	"worklet";
	const remaining = target - current;
	if (Math.abs(remaining) < SNAP_RAD) return target;
	return current + remaining * (1 - Math.exp(-dtMs / tauMs));
}

/** Move the interface tilt `current` toward the sensor's `target` for a frame of `dtMs` */
export function smoothTowards(current: number, target: number, dtMs: number): number {
	"worklet";
	return followTowards(current, target, dtMs, SMOOTH_MS);
}
