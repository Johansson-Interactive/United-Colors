/**
 * Pure state machine behind the pause spirit level. The bubble must first leave the inner
 * circle, then come back and be held level; pausing mid-play (already level) can't resume
 * on its own.
 */

/** "leave": waiting for the bubble to exit the inner circle; "return": hold level to resume */
export type LevelGatePhase = "leave" | "return";

export interface LevelGateState {
	phase: LevelGatePhase;
	/** Hold progress 0..1, only advances in the "return" phase */
	progress: number;
	fired: boolean;
}

/** Tilt (radians, either axis) that still counts as level */
export const LEVEL_RAD = 0.11;
/** How long the device must stay level */
export const HOLD_MS = 900;

export const INITIAL_LEVEL_GATE: LevelGateState = { phase: "leave", progress: 0, fired: false };

export function isLevel(x: number, y: number): boolean {
	"worklet";
	return Math.abs(x) < LEVEL_RAD && Math.abs(y) < LEVEL_RAD;
}

/** Advance the gate one frame. `leaveRad` is the tilt at which the bubble exits the circle. */
export function stepLevelGate(
	state: LevelGateState,
	x: number,
	y: number,
	dt: number,
	leaveRad: number,
): LevelGateState {
	"worklet";
	if (state.fired) return state;
	if (state.phase === "leave") {
		return Math.hypot(x, y) > leaveRad ? { ...state, phase: "return" } : state;
	}
	const progress = isLevel(x, y)
		? Math.min(1, state.progress + dt / HOLD_MS)
		: Math.max(0, state.progress - dt / (HOLD_MS * 0.4));
	return { phase: "return", progress, fired: progress >= 1 };
}
