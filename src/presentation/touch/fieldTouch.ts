import type { Point } from "../effects/portal";

/**
 * Whether a finger is on the field, and where it landed (stage px). The field touch layer
 * (see FieldTouch) writes it as the finger lands and lifts; the bloom and Get ready read it
 * on the UI thread each frame, so a lift reaches them without a render.
 */
export interface FieldTouchState {
	down: boolean;
	x: number;
	y: number;
}

export const FIELD_UNTOUCHED: FieldTouchState = { down: false, x: 0, y: 0 };

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

/** Where a finger landed on the touch layer, in stage px */
export function onStage(at: Point): Point {
	return { x: at.x + FIELD_TOUCH_FRAME.left, y: at.y + FIELD_TOUCH_FRAME.top };
}
