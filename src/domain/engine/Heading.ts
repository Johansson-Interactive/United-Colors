import { SMALL_DOT_HEADING_SPREAD, SMALL_DOT_HEADING_SPREAD_AT_CORNER } from "../constants";

const DEG_TO_RAD = Math.PI / 180;

/** A unit direction off an edge: `normal` into the screen, `tangent` along the edge toward along = 1 */
export interface EdgeHeading {
	normal: number;
	tangent: number;
}

/**
 * The heading of a small dot spawning `along` an edge (0 and 1 at its corners, 0.5 at its
 * middle) from two rolls in [0, 1). The dot sets off on the inward diagonal, 45 degrees from
 * the edge, give or take SMALL_DOT_HEADING_SPREAD, so it bounces round the screen rather than
 * back and forth across it or along its edge. Toward a corner the spread narrows to
 * SMALL_DOT_HEADING_SPREAD_AT_CORNER and the dot turns away from that corner, more surely the
 * nearer it is and always at the corner itself, so none sets off into the wall beside it.
 */
export function edgeHeading(along: number, sideRoll: number, spreadRoll: number): EdgeHeading {
	// -1 at the along = 0 corner, 0 at the middle, +1 at the along = 1 corner
	const offset = Math.max(-1, Math.min(1, 2 * along - 1));
	const nearness = Math.abs(offset);
	const spread =
		SMALL_DOT_HEADING_SPREAD +
		(SMALL_DOT_HEADING_SPREAD_AT_CORNER - SMALL_DOT_HEADING_SPREAD) * nearness;
	const degrees = 45 + (2 * spreadRoll - 1) * spread;
	// The way along the edge that leads away from the nearer corner (either way at the middle)
	const away = offset > 0 ? -1 : 1;
	const sign = sideRoll < 0.5 + 0.5 * nearness ? away : -away;
	const radians = degrees * DEG_TO_RAD;
	return { normal: Math.cos(radians), tangent: sign * Math.sin(radians) };
}
