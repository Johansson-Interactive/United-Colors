import { SNAP_RAD } from "./smoothTilt";

/**
 * The lean of a bowl that follows the hand (ADR 0016): the title's bowl and Get ready's cup read
 * the tilt from their own "down", which follows the tilt over LEAN_MS. A change of grip rolls
 * their dot; once the grip is steady, the dot glides home, whatever the grip.
 */

/**
 * How long a bowl's "down" takes to close all but a third of a change of grip (ms): tuned on a
 * phone, quick enough that any steady grip is level within half a second
 */
const LEAN_MS = 250;

/**
 * One axis of a bowl's "down" (radians) after a frame of `dtMs`, followed towards `tilt`; it
 * snaps onto the tilt once the gap is below notice, so a bowl at rest stops changing
 */
export function leanTowards(lean: number, tilt: number, dtMs: number): number {
	"worklet";
	const remaining = tilt - lean;
	if (Math.abs(remaining) < SNAP_RAD) return tilt;
	return lean + remaining * (1 - Math.exp(-dtMs / LEAN_MS));
}
