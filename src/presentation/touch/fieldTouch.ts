import type { Screen } from "../flow/screenFlow";

/**
 * Whether a finger is on the field. The field touch layer (see FieldTouch) writes it as the
 * finger lands and lifts; the bloom and Get ready read it on the UI thread each frame, so a lift
 * reaches them without a render. Where the finger landed doesn't matter: both portals open at
 * the seat.
 */
export interface FieldTouchState {
	down: boolean;
}

export const FIELD_UNTOUCHED: FieldTouchState = { down: false };

/** The grip down each side of a curved phone (dp); see ADR 0008, GLOSSARY.md: Grip band */
const GRIP_BAND = 24;

/** The field's touch layer: the stage less the grip band down each side */
export const FIELD_TOUCH_FRAME = {
	position: "absolute",
	top: 0,
	bottom: 0,
	left: GRIP_BAND,
	right: GRIP_BAND,
} as const;

/**
 * Whether touch steers the dot (dev only, see useDevControlMode): in a run in play, not once
 * the bloom has started. There a drag on the stage moves the dot, so the field's touch layer
 * takes no touch and can't pause, and the corner pause dot does instead; it goes as the bloom
 * starts, so it never floats, uncut, over the pause world growing from the seat.
 */
export function touchSteers(screen: Screen["kind"], devTouch: boolean): boolean {
	return devTouch && screen === "hud";
}
