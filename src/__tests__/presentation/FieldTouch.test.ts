import { FIELD_TOUCH_FRAME } from "../../presentation/touch/fieldTouch";

describe("the field's touch layer", () => {
	it("keeps a grip band clear down both sides", () => {
		expect(FIELD_TOUCH_FRAME.left).toBeGreaterThan(0);
		expect(FIELD_TOUCH_FRAME.right).toBe(FIELD_TOUCH_FRAME.left);
	});
});
