/**
 * Pure state machine behind the settle bowl (setting the level pose). The player holds the
 * phone the way they like to play; once gravity has stayed put for a moment, its running mean
 * becomes the new level pose. No timer on screen: holding still is the input.
 * The bowl opens waiting, so the player can read what to do; the hold only counts once they
 * start it. The outcome is the pose together with the side it replaces (screen up or turned
 * over), so a turn-over afterwards can't move it.
 */

import { angleBetween, FLAT, gravityTilt, poseSide, turnedToward } from "../../domain/levelPose";
import type { Gravity, PoseSide, TiltAngles } from "../../domain/types";

/**
 * "waiting": open, not yet started; "moving": the hand is still finding its pose;
 * "settling": a hold is under way
 */
export type SettlePhase = "waiting" | "moving" | "settling" | "settled";

export interface SettleState {
	phase: SettlePhase;
	/** Running mean of the gravity read; the pose once settled */
	mean: Gravity;
	/** The side the mean belongs on (see poseSide); the level pose it replaces once settled */
	side: PoseSide;
	/** Gravity when the current hold began; the hold survives while within STILL_RAD of it */
	anchor: Gravity;
	/** Hold progress 0..1; also how far the bowl has levelled itself to the hand */
	progress: number;
	elapsedMs: number;
}

/**
 * How far gravity may turn from the hold's anchor (radians, ~2.3 degrees) and still count as
 * holding still, as forgiving in every pose. Turning on the spot doesn't move gravity, so it
 * doesn't break a hold: it changes nothing the pose keeps (ADR 0014).
 */
export const STILL_RAD = 0.04;
/** How long the pose must hold */
export const SETTLE_HOLD_MS = 2000;
/** Samples this early are ignored so the first frames after starting can't settle by chance */
const WARMUP_MS = 120;
/** Time constant of the running mean */
const MEAN_TAU_MS = 90;

/**
 * A started settle: holds count from here, after a short warm-up. The first sample replaces
 * `mean` and `anchor` outright, so until then they only need to be a real direction.
 */
export const INITIAL_SETTLE: SettleState = {
	phase: "moving",
	mean: FLAT.up,
	side: "up",
	anchor: FLAT.up,
	progress: 0,
	elapsedMs: 0,
};

/** The bowl as it opens: waiting for the player to start */
export const WAITING_SETTLE: SettleState = { ...INITIAL_SETTLE, phase: "waiting" };

/** The level pose and which of the two it replaces, sampled together */
export interface SettleOutcome {
	pose: Gravity;
	side: PoseSide;
}

/** Smoothstep: the bowl eases in and out of level as the hold progresses or breaks */
export function settleEase(progress: number): number {
	"worklet";
	return progress * progress * (3 - 2 * progress);
}

/**
 * Where the bowl's dot rolls (radians) for the phone reading `gravity`: at first its tilt from
 * flat, so it runs to the low edge as in a real bowl, then more and more the tilt from the mean,
 * as play will read it, as the hold levels the bowl to the hand
 */
export function bowlTilt(state: SettleState, gravity: Gravity): TiltAngles {
	"worklet";
	const level = settleEase(state.progress);
	const fromFlat = gravityTilt(gravity, FLAT[state.side], state.side);
	const fromMean = gravityTilt(gravity, state.mean, state.side);
	return {
		x: fromFlat.x + (fromMean.x - fromFlat.x) * level,
		y: fromFlat.y + (fromMean.y - fromFlat.y) * level,
	};
}

/**
 * Advance one frame with the latest gravity and the level pose in use (see levelTilt), which
 * decides the mean's side only near upright (see poseSide)
 */
export function stepSettle(
	state: SettleState,
	gravity: Gravity,
	side: PoseSide,
	dt: number,
): SettleState {
	"worklet";
	if (state.phase === "waiting" || state.phase === "settled") return state;
	const first = state.elapsedMs === 0;
	const elapsedMs = state.elapsedMs + dt;
	const k = first ? 1 : 1 - Math.exp(-dt / MEAN_TAU_MS);
	const mean = turnedToward(state.mean, gravity, k);
	// A new hold anchors where the hand is now; a hold in progress keeps its anchor so that a
	// slow drift adds up and breaks it instead of being tracked
	const anchor = state.progress === 0 ? gravity : state.anchor;
	const still = elapsedMs > WARMUP_MS && angleBetween(gravity, anchor) < STILL_RAD;
	const progress = still
		? Math.min(1, state.progress + dt / SETTLE_HOLD_MS)
		: Math.max(0, state.progress - dt / (SETTLE_HOLD_MS * 0.5));
	const phase: SettlePhase = progress >= 1 ? "settled" : progress > 0 ? "settling" : "moving";
	return { phase, mean, side: poseSide(mean, side), anchor, progress, elapsedMs };
}

/**
 * TAP: the hold begins. Without a tilt sensor there is nothing to hold, so a flat pose,
 * screen up, is set straight away.
 */
export function startSettle(state: SettleState, tiltAvailable: boolean): SettleState {
	"worklet";
	if (state.phase !== "waiting") return state;
	if (tiltAvailable) return INITIAL_SETTLE;
	return { ...INITIAL_SETTLE, phase: "settled", progress: 1 };
}

/**
 * A tap once started: settle now on the running mean and its side as of the sample it last
 * took. Before any tilt has been measured the pose is flat, for the pose in use at the tap. A
 * settled pose is final.
 */
export function setSettleNow(state: SettleState, sideNow: PoseSide): SettleState {
	"worklet";
	if (state.phase === "waiting" || state.phase === "settled") return state;
	if (state.elapsedMs > 0) return { ...state, phase: "settled", progress: 1 };
	return { ...state, phase: "settled", mean: FLAT[sideNow], side: sideNow, progress: 1 };
}

/** The pose and which it replaces once settled; null before */
export function settleOutcome(state: SettleState): SettleOutcome | null {
	"worklet";
	if (state.phase !== "settled") return null;
	return { pose: state.mean, side: state.side };
}
