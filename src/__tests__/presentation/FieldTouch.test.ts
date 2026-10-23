import { FIELD_TOUCH_FRAME, onStage, touchSteers } from "../../presentation/touch/fieldTouch";

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

describe("where touch steers the dot (dev)", () => {
	it("steers in a run in play only in the dev mode where touch steers, so the field can't pause there", () => {
		expect(touchSteers("hud", true)).toBe(true);
		expect(touchSteers("hud", false)).toBe(false);
	});

	it("stops as the bloom starts, so the pause dot never floats over the pause world the bloom opens", () => {
		expect(touchSteers("frosting", true)).toBe(false);
	});

	it("is not on any other screen", () => {
		for (const screen of ["title", "pause", "getReady", "gameOver"] as const) {
			expect(touchSteers(screen, true)).toBe(false);
		}
	});
});
