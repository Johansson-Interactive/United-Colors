/**
 * The score's bump on a catch, as a pure curve over the bump's progress (0..1): a quick swell,
 * then the damped wobble of the spring it replaces, tapered so it lands exactly on rest at the
 * end. A Reanimated spring only stops once its energy falls to a few billionths of where it
 * began, about 2 s after it looks still, and every one of those frames commits the score's
 * view props on Android; this one is done when it looks done.
 */

/** How long a bump lasts (ms) */
export const SCORE_BUMP_MS = 650;
/** The score's scale at the top of the swell */
export const SCORE_BUMP_PEAK = 1.22;
/** How long the swell takes (ms) */
const RISE_MS = 70;
/** The old spring (damping 9, stiffness 260, mass 1): its decay rate and ringing frequency, per s */
const DECAY = 4.5;
const RING = Math.sqrt(260 - DECAY * DECAY);

/** The score's scale at `progress` through a bump; exactly 1 at and outside both ends */
export function scoreBumpScale(progress: number): number {
	"worklet";
	if (progress <= 0 || progress >= 1) return 1;
	const ms = progress * SCORE_BUMP_MS;
	if (ms < RISE_MS) return 1 + ((SCORE_BUMP_PEAK - 1) * ms) / RISE_MS;
	const s = (ms - RISE_MS) / 1000;
	const taper = (SCORE_BUMP_MS - ms) / (SCORE_BUMP_MS - RISE_MS);
	const wobble = Math.exp(-DECAY * s) * (Math.cos(RING * s) + (DECAY / RING) * Math.sin(RING * s));
	return 1 + (SCORE_BUMP_PEAK - 1) * wobble * taper;
}
