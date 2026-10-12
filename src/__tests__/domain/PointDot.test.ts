import {
	ABSORB_TICKS,
	POINT_DOT_FADE_TIME,
	POINT_DOT_SIZE_ANIMATION_TIME,
} from "../../domain/constants";
import { PointDot } from "../../domain/entities/PointDot";

describe("PointDot", () => {
	it("starts with size 0 (zoom-in animation)", () => {
		const pd = new PointDot("p", 0, 100, 200, "#E91E63", 50, 5);
		expect(pd.size).toBe(0);
	});

	it("zoom-in reaches target size after animation time", () => {
		const pd = new PointDot("p", 0, 100, 200, "#E91E63", 50, 5);
		for (let t = 1; t <= POINT_DOT_SIZE_ANIMATION_TIME; t++) {
			pd.update(t);
		}
		expect(pd.size).toBe(50);
	});

	it("starts pulsing after zoom-in completes", () => {
		const pd = new PointDot("p", 0, 100, 200, "#E91E63", 50, 5);
		// Complete zoom-in
		for (let t = 1; t <= POINT_DOT_SIZE_ANIMATION_TIME + 1; t++) {
			pd.update(t);
		}
		// After zoom-in, should be pulsing (size starts shrinking)
		const sizeAfterZoomIn = pd.size;
		for (let t = POINT_DOT_SIZE_ANIMATION_TIME + 2; t <= POINT_DOT_SIZE_ANIMATION_TIME + 5; t++) {
			pd.update(t);
		}
		expect(pd.size).toBeLessThan(sizeAfterZoomIn);
	});

	it("flags for removal after POINT_DOT_FADE_TIME", () => {
		const pd = new PointDot("p", 0, 100, 200, "#E91E63", 50, 5);
		for (let t = 1; t < POINT_DOT_FADE_TIME; t++) {
			pd.update(t);
		}
		expect(pd.isFlaggedForRemoval).toBe(false);

		// At fade time, should start zoom-out (but not immediately removable)
		pd.update(POINT_DOT_FADE_TIME);
		// During zoom-out, isFlaggedForRemoval returns false
		expect(pd.isFlaggedForRemoval).toBe(false);
	});

	it("becomes removable after zoom-out completes", () => {
		const pd = new PointDot("p", 0, 100, 200, "#E91E63", 50, 5);
		// Trigger fade by advancing past POINT_DOT_FADE_TIME
		for (let t = 1; t <= POINT_DOT_FADE_TIME; t++) {
			pd.update(t);
		}
		// Advance through zoom-out animation
		for (
			let t = POINT_DOT_FADE_TIME + 1;
			t <= POINT_DOT_FADE_TIME + POINT_DOT_SIZE_ANIMATION_TIME + 1;
			t++
		) {
			pd.update(t);
		}
		expect(pd.isFlaggedForRemoval).toBe(true);
		expect(pd.size).toBe(0);
	});

	it("once caught it stops pulsing and merges into the player before it is removable", () => {
		const pd = new PointDot("p", 0, 100, 200, "#E91E63", 50, 5);
		for (let t = 1; t <= POINT_DOT_SIZE_ANIMATION_TIME + 3; t++) pd.update(t);
		const sizeWhenCaught = pd.size;
		pd.startAbsorb();
		expect(pd.isAbsorbing).toBe(true);
		expect(pd.isFlaggedForRemoval).toBe(false);

		let t = POINT_DOT_SIZE_ANIMATION_TIME + 4;
		for (let i = 1; i < ABSORB_TICKS; i++, t++) {
			pd.update(t);
			expect(pd.size).toBe(sizeWhenCaught);
			expect(pd.isFlaggedForRemoval).toBe(false);
		}
		pd.update(t);
		expect(pd.absorb).toBe(1);
		expect(pd.isFlaggedForRemoval).toBe(true);
	});

	it("does not fade out on its timeout while merging", () => {
		const pd = new PointDot("p", 0, 100, 200, "#E91E63", 50, 5);
		for (let t = 1; t <= POINT_DOT_SIZE_ANIMATION_TIME; t++) pd.update(t);
		expect(pd.size).toBe(50);
		pd.startAbsorb();
		pd.update(POINT_DOT_FADE_TIME + 1);
		expect(pd.size).toBe(50);
		expect(pd.absorb).toBeCloseTo(1 / ABSORB_TICKS);
	});

	it("has correct value", () => {
		const pd = new PointDot("p", 0, 100, 200, "#E91E63", 50, 5);
		expect(pd.value).toBe(5);
	});
});
