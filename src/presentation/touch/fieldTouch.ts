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
