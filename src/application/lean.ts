/**
 * How a point dot leans toward the player as it comes near, so it reads as wanting to be
 * caught where every wrong-colour dot just drifts past. The dot stretches toward the player
 * with its back edge held where it was, reaching out further the closer the player gets.
 *
 * The lean is drawn only: the dot is still caught when the player touches its round body.
 * So its tip never closes more than LEAN_GAP_SHARE of the gap to the player, and it is round
 * again by the moment they touch.
 */

/** The lean starts when the gap between the two surfaces is this many player radii */
export const LEAN_RANGE = 4;
/** The furthest the tip reaches out, as a fraction of the dot's radius */
export const LEAN_MAX_REACH = 0.4;
/** The tip closes at most this share of the gap to the player */
export const LEAN_GAP_SHARE = 0.5;

/**
 * How far (px) a point dot of radius `dotRadius` reaches its tip out toward a player of
 * radius `playerRadius` whose surface is `gap` px away
 */
export function leanReach(gap: number, playerRadius: number, dotRadius: number): number {
	if (gap <= 0 || playerRadius <= 0 || dotRadius <= 0) return 0;
	const near = Math.min(1, Math.max(0, 1 - gap / (LEAN_RANGE * playerRadius)));
	const eased = near * near * (3 - 2 * near);
	return Math.min(LEAN_MAX_REACH * dotRadius * eased, LEAN_GAP_SHARE * gap);
}
