import type { Point } from "../effects/portal";
import type { Screen } from "../flow/screenFlow";

/**
 * Whether a finger is on the field, where it landed (stage px), and when it last landed and
 * lifted. The field touch layer (see FieldTouch) writes it as the finger lands and lifts; the
 * bloom and Get ready read it on the UI thread each frame, so a lift reaches them without a
 * render. The bloom opens where the finger landed; Get ready opens at the seat. A drained bloom
 * hands the lift's time to the flow, which counts a second touch's second from it.
 */
export interface FieldTouchState {
	down: boolean;
	x: number;
	y: number;
	/** When the finger last landed (ms, on FieldTouch's clock); 0 before any landing */
	landedAt: number;
	/** When the finger last lifted (ms, on FieldTouch's clock); 0 before any lift */
	liftedAt: number;
}

export const FIELD_UNTOUCHED: FieldTouchState = {
	down: false,
	x: 0,
	y: 0,
	landedAt: 0,
	liftedAt: 0,
};

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

/**
 * Whether touch steers the dot (dev only, see useDevControlMode): in a run in play, not once
 * the bloom has started. There a drag on the stage moves the dot, so the field's touch layer
 * takes no touch and can't pause, and the corner pause dot does instead; it goes as the bloom
 * starts, so it never floats, uncut, over the pause world the bloom opens.
 */
export function touchSteers(screen: Screen["kind"], devTouch: boolean): boolean {
	return devTouch && screen === "hud";
}
