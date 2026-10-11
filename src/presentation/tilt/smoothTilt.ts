/**
 * Pure smoothing step for the interface tilt. The smoothed value chases the raw sample
 * exponentially, then snaps onto it once the gap is below the eye's notice, so a phone at
 * rest stops producing new values and everything derived from the tilt can go quiet.
 */

/** Fraction of the remaining distance closed per frame at 60 Hz */
export const SMOOTHING = 0.18;
/** Frame length the smoothing rate is stated for */
const REFERENCE_FRAME_MS = 1000 / 60;
/** Remaining distance (radians) under which the value snaps to the target instead of chasing it */
export const SNAP_RAD = 1e-4;

/** Move `current` toward `target` for a frame of `dtMs`; returns `target` itself once close */
export function smoothTowards(current: number, target: number, dtMs: number): number {
	"worklet";
	const remaining = target - current;
	if (Math.abs(remaining) < SNAP_RAD) return target;
	const k = 1 - (1 - SMOOTHING) ** (dtMs / REFERENCE_FRAME_MS);
	return current + remaining * k;
}
