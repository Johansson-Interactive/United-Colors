import { FIELD_TOUCH_FRAME, touchSteers } from "../../presentation/touch/fieldTouch";

describe("the field's touch layer", () => {
	it("keeps a grip band clear down both sides", () => {
		expect(FIELD_TOUCH_FRAME.left).toBeGreaterThan(0);
		expect(FIELD_TOUCH_FRAME.right).toBe(FIELD_TOUCH_FRAME.left);
	});
});

describe("where touch steers the dot (dev)", () => {
	it("steers in a run in play only in the dev mode where touch steers, so the field can't pause there", () => {
		expect(touchSteers("hud", true)).toBe(true);
		expect(touchSteers("hud", false)).toBe(false);
	});

	it("stops as the bloom starts, so the pause dot never floats over the pause world growing from the seat", () => {
		expect(touchSteers("frosting", true)).toBe(false);
	});

	it("is not on any other screen", () => {
		for (const screen of ["title", "pause", "getReady", "gameOver"] as const) {
			expect(touchSteers(screen, true)).toBe(false);
		}
	});
});
