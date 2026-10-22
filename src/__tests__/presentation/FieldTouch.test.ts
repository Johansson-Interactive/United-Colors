import { FIELD_TOUCH_FRAME, onStage } from "../../presentation/touch/fieldTouch";

describe("the field's touch layer", () => {
	it("keeps a grip band clear down both sides", () => {
		expect(FIELD_TOUCH_FRAME.left).toBeGreaterThan(0);
		expect(FIELD_TOUCH_FRAME.right).toBe(FIELD_TOUCH_FRAME.left);
	});

	it("puts a landing at the layer's corner at the layer's place on the stage", () => {
		expect(onStage({ x: 0, y: 0 })).toEqual({
			x: FIELD_TOUCH_FRAME.left,
			y: FIELD_TOUCH_FRAME.top,
		});
	});

	it("moves a landing on the layer by the layer's offset alone", () => {
		expect(onStage({ x: 150, y: 600 })).toEqual({
			x: 150 + FIELD_TOUCH_FRAME.left,
			y: 600 + FIELD_TOUCH_FRAME.top,
		});
	});
});
