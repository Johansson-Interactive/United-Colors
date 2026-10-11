/**
 * How the player refuses a wrong-colour dot, as pure curves of the refusal's progress
 * (0..1 over REJECT_TICKS, see DotView.reject):
 *
 * 1. Reach: a film of the player's liquid spreads round the dot from where they touch.
 * 2. Refuse: the film holds there and shivers.
 * 3. Spit: the film snaps back, the dot is pushed clear and the player recoils from it.
 *
 * At 1 (and so for the whole game over screen) the film is gone, the dot sits clear of the
 * player and the recoil has run out.
 */

/** The film has spread fully round the dot by here */
export const REJECT_REACH_END = 0.4;
/** The player lets go and spits the dot out from here; the haptic fires as this is crossed */
export const REJECT_SPIT_AT = 0.62;
/** The film has drawn fully back into the player by here */
const REJECT_RETRACT_END = 0.82;
/** How far the film's spread swings while it shivers, as a fraction of its full spread */
const REJECT_SHIVER = 0.06;
/** Whole shivers while the film holds */
const REJECT_SHIVER_CYCLES = 1.5;

/** Spit-out gap between the dot and the player at the end, as a fraction of the dot radius */
export const REJECT_SPIT_GAP = 0.35;
/** Peak recoil of the player away from the dot, as a fraction of the player radius */
export const REJECT_RECOIL = 0.22;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/**
 * How far the film has spread round the dot: 0 (none) to 1 (full spread), a little past 1
 * at the top of a shiver
 */
export function rejectWrap(reject: number): number {
	if (reject <= 0) return 0;
	if (reject < REJECT_REACH_END) {
		const e = reject / REJECT_REACH_END;
		return 1 - (1 - e) ** 3;
	}
	if (reject < REJECT_SPIT_AT) {
		const e = (reject - REJECT_REACH_END) / (REJECT_SPIT_AT - REJECT_REACH_END);
		return 1 + REJECT_SHIVER * Math.sin(e * REJECT_SHIVER_CYCLES * 2 * Math.PI);
	}
	const e = clamp01((reject - REJECT_SPIT_AT) / (REJECT_RETRACT_END - REJECT_SPIT_AT));
	return (1 - e) ** 2;
}

/** How far the dot has been pushed from where it touched to clear of the player, 0..1 */
export function rejectPush(reject: number): number {
	const e = clamp01((reject - REJECT_SPIT_AT) / (1 - REJECT_SPIT_AT));
	return 1 - (1 - e) ** 3;
}

/** The player's recoil away from the dot, 0..1: a quick kick that has eased off by the end */
export function rejectRecoil(reject: number): number {
	const e = clamp01((reject - REJECT_SPIT_AT) / (1 - REJECT_SPIT_AT));
	return Math.sin(Math.PI * Math.sqrt(e));
}
