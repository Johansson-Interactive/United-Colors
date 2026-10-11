/**
 * How the player refuses a wrong-colour dot, like a ball hitting a water balloon, as pure
 * curves of the refusal's progress (0..1 over REJECT_TICKS, see DotView.reject):
 *
 * 1. Press: the dot sinks a little way into the player, which dents round it and squashes.
 * 2. Hold: the dot sits in the dent while the player quivers against it.
 * 3. Spit: the player springs back, pushing the dot clear, and recoils from it.
 *
 * At 1 (and so for the whole game over screen) the dot sits clear of the player, the dent
 * has filled back in and the recoil has run out.
 */

/** The dot has sunk in as far as it goes by here */
export const REJECT_PRESS_END = 0.3;
/** The player springs back and pushes the dot out from here; the haptic fires as it is crossed */
export const REJECT_SPIT_AT = 0.5;
/** How far the press swings while the player quivers, as a fraction of the full press */
const REJECT_QUIVER = 0.08;
/** Whole quivers during the hold */
const REJECT_QUIVER_CYCLES = 1.5;

/** How deep the dot sinks into the player, as a fraction of the dot's radius */
export const REJECT_PRESS_DEPTH = 0.5;
/** Spit-out gap between the dot and the player at the end, as a fraction of the dot radius */
export const REJECT_SPIT_GAP = 0.35;
/** Peak recoil of the player away from the dot, as a fraction of the player radius */
export const REJECT_RECOIL = 0.22;
/** How much the player squashes along the hit (and bulges across it) at the full press */
export const REJECT_SQUASH = 0.12;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/**
 * How far the dot has pressed in from where it touched: 0 to 1 (full press depth), swinging
 * a little either side of 1 while the player quivers. Stays 1 once the spit starts; the push
 * then carries the dot out.
 */
export function rejectPress(reject: number): number {
	if (reject <= 0) return 0;
	if (reject < REJECT_PRESS_END) {
		const e = reject / REJECT_PRESS_END;
		return 1 - (1 - e) ** 3;
	}
	if (reject < REJECT_SPIT_AT) {
		const e = (reject - REJECT_PRESS_END) / (REJECT_SPIT_AT - REJECT_PRESS_END);
		return 1 + REJECT_QUIVER * Math.sin(e * REJECT_QUIVER_CYCLES * 2 * Math.PI);
	}
	return 1;
}

/** How far the dot has been pushed from the full press to clear of the player, 0..1 */
export function rejectPush(reject: number): number {
	const e = clamp01((reject - REJECT_SPIT_AT) / (1 - REJECT_SPIT_AT));
	return 1 - (1 - e) ** 3;
}

/** The player's recoil away from the dot, 0..1: a quick kick that has eased off by the end */
export function rejectRecoil(reject: number): number {
	const e = clamp01((reject - REJECT_SPIT_AT) / (1 - REJECT_SPIT_AT));
	return Math.sin(Math.PI * Math.sqrt(e));
}

/**
 * How far the dot overlaps the player's surface (px; negative once it is clear) at progress
 * `reject`, given how far it overlapped when it touched (`touched`) and its radius
 */
export function rejectPenetration(reject: number, touched: number, dotRadius: number): number {
	const deepest = Math.max(touched, dotRadius * REJECT_PRESS_DEPTH);
	const pressed = touched + (deepest - touched) * rejectPress(reject);
	return pressed + (-dotRadius * REJECT_SPIT_GAP - pressed) * rejectPush(reject);
}
