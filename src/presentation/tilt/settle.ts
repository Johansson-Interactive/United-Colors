/**
 * Pure state machine behind the settle bowl (setting the level pose). The player holds the
 * phone the way they like to play; once the tilt has stayed put for a moment the running
 * mean becomes the new zero. No timer on screen: holding still is the input. The bowl opens
 * waiting, so the player can read what to do; the hold only counts once they start it.
 */

/**
 * "waiting": open, not yet started; "moving": the hand is still finding its pose;
 * "settling": a hold is under way
 */
export type SettlePhase = "waiting" | "moving" | "settling" | "settled";

export interface SettleState {
	phase: SettlePhase;
	/** Running mean of the raw tilt (radians); the zero once settled */
	meanX: number;
	meanY: number;
	/** Tilt when the current hold began; the hold survives while within STILL_RAD of it */
	anchorX: number;
	anchorY: number;
	/** Hold progress 0..1; also how far the bowl has levelled itself to the hand */
	progress: number;
	elapsedMs: number;
}

/** Drift from the hold's anchor (radians, ~2.3 degrees) that still counts as holding still */
export const STILL_RAD = 0.04;
/** How long the pose must hold */
export const SETTLE_HOLD_MS = 2000;
/** Samples this early are ignored so the first frames after starting can't settle by chance */
const WARMUP_MS = 120;
/** Time constant of the running mean */
const MEAN_TAU_MS = 90;

/** A started settle: holds count from here, after a short warm-up */
export const INITIAL_SETTLE: SettleState = {
	phase: "moving",
	meanX: 0,
	meanY: 0,
	anchorX: 0,
	anchorY: 0,
	progress: 0,
	elapsedMs: 0,
};

/** The bowl as it opens: waiting for the player to start */
export const WAITING_SETTLE: SettleState = { ...INITIAL_SETTLE, phase: "waiting" };

/** Smoothstep: the bowl eases in and out of level as the hold progresses or breaks */
export function settleEase(progress: number): number {
	"worklet";
	return progress * progress * (3 - 2 * progress);
}

/** Advance one frame with the latest raw tilt sample */
export function stepSettle(state: SettleState, x: number, y: number, dt: number): SettleState {
	"worklet";
	if (state.phase === "waiting" || state.phase === "settled") return state;
	const first = state.elapsedMs === 0;
	const elapsedMs = state.elapsedMs + dt;
	const k = first ? 1 : 1 - Math.exp(-dt / MEAN_TAU_MS);
	const meanX = state.meanX + (x - state.meanX) * k;
	const meanY = state.meanY + (y - state.meanY) * k;
	// A new hold anchors where the hand is now; a hold in progress keeps its anchor so that a
	// slow drift adds up and breaks it instead of being tracked
	const anchorX = state.progress === 0 ? x : state.anchorX;
	const anchorY = state.progress === 0 ? y : state.anchorY;
	const still = elapsedMs > WARMUP_MS && Math.hypot(x - anchorX, y - anchorY) < STILL_RAD;
	const progress = still
		? Math.min(1, state.progress + dt / SETTLE_HOLD_MS)
		: Math.max(0, state.progress - dt / (SETTLE_HOLD_MS * 0.5));
	const phase: SettlePhase = progress >= 1 ? "settled" : progress > 0 ? "settling" : "moving";
	return { phase, meanX, meanY, anchorX, anchorY, progress, elapsedMs };
}
