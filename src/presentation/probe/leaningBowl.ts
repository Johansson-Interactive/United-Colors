import type { Gravity } from "../../domain/types";

/**
 * A throwaway prototype of the cup that leans to match the hand (ADR 0016), to feel on a real
 * phone before it goes into Get ready. The bowl's "down" follows gravity over `leanMs`, so any
 * grip held steady becomes level, and the dot, on a spring to where the tilt from that down puts
 * it, sloshes as the grip changes and rolls home once it is steady. It is home, settled, once
 * it has stayed near the seat, slowly, for SETTLE_MS: the moment Get ready would take the level
 * pose.
 */

export interface BowlTuning {
	/** How long the bowl's down takes to close all but a third of a change of grip (ms) */
	leanMs: number;
	/** How quickly the slosh dies away: 1 rolls home without overshoot, nearer 0 rocks longer */
	damping: number;
}

export const BOWL_TUNING: BowlTuning = { leanMs: 1000, damping: 0.4 };

/** Pixels the dot is pushed off the seat per radian of tilt, as Get ready's cup rolls it */
const ROLL_GAIN = 150;

/** How fast the dot rocks on its spring when undamped (per second) */
const SLOSH_HZ = 1.2;

/** Near enough the seat (px) and slow enough (px a second) to count towards settling */
const SETTLE_PX = 4;
const SETTLE_SPEED = 30;

/** How long the dot must stay near and slow to be home (ms) */
const SETTLE_MS = 300;

/** The longest step the spring takes at once (ms), so a late sample can't fling the dot */
const MAX_STEP_MS = 1000 / 60;

/** A gap in the samples longer than this (ms) starts the bowl over */
const LONGEST_GAP_MS = 200;

interface Vec2 {
	x: number;
	y: number;
}

export interface LeaningBowl {
	/** The bowl's down, at unit length; null before the first sample */
	down: Gravity | null;
	/** The dot, off the seat (px, screen axes) */
	dot: Vec2;
	velocity: Vec2;
	/** How long the dot has been near the seat and slow (ms) */
	stillMs: number;
	settled: boolean;
	/** How many times it has settled */
	settles: number;
	timeMs: number | null;
}

export const LEANING_BOWL_START: LeaningBowl = {
	down: null,
	dot: { x: 0, y: 0 },
	velocity: { x: 0, y: 0 },
	stillMs: 0,
	settled: false,
	settles: 0,
	timeMs: null,
};

function unit(v: Gravity): Gravity {
	const length = Math.hypot(v.x, v.y, v.z) || 1;
	return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Where the tilt from the bowl's down pushes the dot (px off the seat): a right edge lowered
 * moves gravity towards the screen's x and the dot right; the top raised moves gravity towards
 * the screen's foot and the dot down. Kept inside `travel`.
 */
function target(gravity: Gravity, down: Gravity, travel: number): Vec2 {
	const x = (gravity.x - down.x) * ROLL_GAIN;
	const y = -(gravity.y - down.y) * ROLL_GAIN;
	const push = Math.hypot(x, y);
	return push > travel ? { x: (x / push) * travel, y: (y / push) * travel } : { x, y };
}

/** One spring step of `dtMs` towards `goal`, held inside `travel` like a dot against the glass */
function slosh(
	dot: Vec2,
	velocity: Vec2,
	goal: Vec2,
	dtMs: number,
	damping: number,
	travel: number,
): { dot: Vec2; velocity: Vec2 } {
	const omega = 2 * Math.PI * SLOSH_HZ;
	const dt = dtMs / 1000;
	let vx = velocity.x + (omega * omega * (goal.x - dot.x) - 2 * damping * omega * velocity.x) * dt;
	let vy = velocity.y + (omega * omega * (goal.y - dot.y) - 2 * damping * omega * velocity.y) * dt;
	let x = dot.x + vx * dt;
	let y = dot.y + vy * dt;
	const out = Math.hypot(x, y);
	if (out > travel) {
		// Against the glass: back onto the rim, losing the speed into it
		const nx = x / out;
		const ny = y / out;
		x = nx * travel;
		y = ny * travel;
		const into = vx * nx + vy * ny;
		if (into > 0) {
			vx -= into * nx;
			vy -= into * ny;
		}
	}
	return { dot: { x, y }, velocity: { x: vx, y: vy } };
}

/** The bowl after one more gravity sample at `timeMs`, with the dot kept within `travel` px */
export function stepLeaningBowl(
	bowl: LeaningBowl,
	gravity: Gravity,
	timeMs: number,
	tuning: BowlTuning,
	travel: number,
): LeaningBowl {
	const g = unit(gravity);
	const dtMs = bowl.timeMs === null ? 0 : timeMs - bowl.timeMs;
	// A sample read at the same moment again (Android resends the last) says nothing new
	if (bowl.down !== null && dtMs === 0) return bowl;
	if (bowl.down === null || dtMs < 0 || dtMs > LONGEST_GAP_MS) {
		return { ...LEANING_BOWL_START, down: g, settles: bowl.settles, timeMs };
	}

	const lean = 1 - Math.exp(-dtMs / tuning.leanMs);
	const down = unit({
		x: bowl.down.x + (g.x - bowl.down.x) * lean,
		y: bowl.down.y + (g.y - bowl.down.y) * lean,
		z: bowl.down.z + (g.z - bowl.down.z) * lean,
	});
	const goal = target(g, down, travel);

	let { dot, velocity } = bowl;
	for (let left = dtMs; left > 0; left -= MAX_STEP_MS) {
		({ dot, velocity } = slosh(
			dot,
			velocity,
			goal,
			Math.min(left, MAX_STEP_MS),
			tuning.damping,
			travel,
		));
	}

	const near = Math.hypot(dot.x, dot.y) < SETTLE_PX;
	const slow = Math.hypot(velocity.x, velocity.y) < SETTLE_SPEED;
	const stillMs = near && slow ? bowl.stillMs + dtMs : 0;
	// Once home it stays home until it leaves the seat clearly, so the edge doesn't flicker
	const settled = bowl.settled ? Math.hypot(dot.x, dot.y) < 2 * SETTLE_PX : stillMs >= SETTLE_MS;
	const settles = settled && !bowl.settled ? bowl.settles + 1 : bowl.settles;
	return { down, dot, velocity, stillMs, settled, settles, timeMs };
}
