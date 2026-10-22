/**
 * Pure state machine behind the settle bowl (setting the level pose). The player holds the
 * phone the way they like to play; once gravity has stayed put for a moment the running
 * mean becomes the new zero. No timer on screen: holding still is the input. The bowl opens
 * waiting, so the player can read what to do; the hold only counts once they start it. The
 * outcome is the pose together with the level pose it replaces (screen up or turned over), so
 * a turn-over afterwards can't move it.
 */

import { angleBetween, FLAT_DOWN, FLAT_UP, unitGravity } from "../../domain/levelPose";
import type { Gravity, TiltZero } from "../../domain/types";

/**
 * "waiting": open, not yet started; "moving": the hand is still finding its pose;
 * "settling": a hold is under way
 */
export type SettlePhase = "waiting" | "moving" | "settling" | "settled";

export interface SettleState {
	phase: SettlePhase;
	/** Running mean of the gravity read; the zero once settled */
	mean: Gravity;
	/**
	 * Whether the screen-down pose was in use at the latest sample; the pose the zero replaces
	 * once settled
	 */
	facingDown: boolean;
	/** Gravity when the current hold began; the hold survives while within STILL_RAD of it */
	anchor: Gravity;
	/** Hold progress 0..1; also how far the bowl has levelled itself to the hand */
	progress: number;
	elapsedMs: number;
}

/**
 * How far gravity may turn from the hold's anchor (radians, ~2.3 degrees) and still count as
 * holding still. Gravity's own angle, so it is as forgiving upright or on your side as flat.
 */
export const STILL_RAD = 0.04;
/** How long the pose must hold */
export const SETTLE_HOLD_MS = 2000;
/** Samples this early are ignored so the first frames after starting can't settle by chance */
const WARMUP_MS = 120;
/** Time constant of the running mean */
const MEAN_TAU_MS = 90;

const NO_GRAVITY: Gravity = { x: 0, y: 0, z: 0 };

/** A started settle: holds count from here, after a short warm-up */
export const INITIAL_SETTLE: SettleState = {
	phase: "moving",
	mean: NO_GRAVITY,
	facingDown: false,
	anchor: NO_GRAVITY,
	progress: 0,
	elapsedMs: 0,
};

/** The bowl as it opens: waiting for the player to start */
export const WAITING_SETTLE: SettleState = { ...INITIAL_SETTLE, phase: "waiting" };

/** The level pose and which of the two it replaces, sampled together */
export interface SettleOutcome {
	zero: TiltZero;
	facingDown: boolean;
}

/** Smoothstep: the bowl eases in and out of level as the hold progresses or breaks */
export function settleEase(progress: number): number {
	"worklet";
	return progress * progress * (3 - 2 * progress);
}

/**
 * Advance one frame with the latest gravity sample and whether the screen-down pose is in use
 * (see levelTilt)
 */
export function stepSettle(
	state: SettleState,
	gravity: Gravity,
	facingDown: boolean,
	dt: number,
): SettleState {
	"worklet";
	if (state.phase === "waiting" || state.phase === "settled") return state;
	const first = state.elapsedMs === 0;
	const elapsedMs = state.elapsedMs + dt;
	const k = first ? 1 : 1 - Math.exp(-dt / MEAN_TAU_MS);
	const mean = {
		x: state.mean.x + (gravity.x - state.mean.x) * k,
		y: state.mean.y + (gravity.y - state.mean.y) * k,
		z: state.mean.z + (gravity.z - state.mean.z) * k,
	};
	// A new hold anchors where the hand is now; a hold in progress keeps its anchor so that a
	// slow drift adds up and breaks it instead of being tracked
	const anchor = state.progress === 0 ? gravity : state.anchor;
	const still = elapsedMs > WARMUP_MS && angleBetween(gravity, anchor) < STILL_RAD;
	const progress = still
		? Math.min(1, state.progress + dt / SETTLE_HOLD_MS)
		: Math.max(0, state.progress - dt / (SETTLE_HOLD_MS * 0.5));
	const phase: SettlePhase = progress >= 1 ? "settled" : progress > 0 ? "settling" : "moving";
	return { phase, mean, facingDown, anchor, progress, elapsedMs };
}

/**
 * TAP: the hold begins. Without a tilt sensor there is nothing to hold, so a flat pose,
 * screen up, is set straight away.
 */
export function startSettle(state: SettleState, tiltAvailable: boolean): SettleState {
	"worklet";
	if (state.phase !== "waiting") return state;
	if (tiltAvailable) return INITIAL_SETTLE;
	return { ...INITIAL_SETTLE, phase: "settled", mean: FLAT_UP, progress: 1 };
}

/**
 * A tap once started: settle now on the running mean and the pose in use at the sample it last
 * took. Before any tilt has been measured the pose is flat, for the pose in use at the tap. A
 * settled pose is final.
 */
export function setSettleNow(state: SettleState, facingDownNow: boolean): SettleState {
	"worklet";
	if (state.phase === "waiting" || state.phase === "settled") return state;
	const measured = state.elapsedMs > 0;
	const facingDown = measured ? state.facingDown : facingDownNow;
	return {
		...state,
		phase: "settled",
		mean: measured ? state.mean : facingDown ? FLAT_DOWN : FLAT_UP,
		facingDown,
		progress: 1,
	};
}

/** The pose and which it replaces once settled; null before */
export function settleOutcome(state: SettleState): SettleOutcome | null {
	"worklet";
	if (state.phase !== "settled") return null;
	return { zero: unitGravity(state.mean), facingDown: state.facingDown };
}
