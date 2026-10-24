import type { TiltAngles } from "../../domain/types";
import { followTowards } from "./smoothTilt";

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

/** A bowl that follows the hand, as of one frame */
export interface Lean {
	/** The bowl's "down", as a tilt: the grip its dot rests in */
	down: TiltAngles;
	/** The tilt as the bowl reads it, from its own down: what rolls its dot */
	tilt: TiltAngles;
}

/**
 * The lean after a frame of `dtMs` with the hand at `tilt`. With no lean yet, the bowl starts
 * leaning to the hand as it is, so its dot starts at rest in whatever grip. A bowl at rest gets
 * `lean` itself back, so a shared value holding it is not written again.
 */
export function followLean(lean: Lean | null, tilt: TiltAngles, dtMs: number): Lean {
	"worklet";
	if (lean === null) return { down: tilt, tilt: { x: 0, y: 0 } };
	const x = followTowards(lean.down.x, tilt.x, dtMs, LEAN_MS);
	const y = followTowards(lean.down.y, tilt.y, dtMs, LEAN_MS);
	const read = { x: tilt.x - x, y: tilt.y - y };
	const resting =
		x === lean.down.x && y === lean.down.y && read.x === lean.tilt.x && read.y === lean.tilt.y;
	return resting ? lean : { down: { x, y }, tilt: read };
}
