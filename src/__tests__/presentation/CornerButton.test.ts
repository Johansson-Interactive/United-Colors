import { describe, expect, it } from "vitest";
import { cornerExtent, holdInside } from "../../domain/arena";
import type { ScreenSize } from "../../domain/types";
import { cornerButton } from "../../presentation/layout/cornerButton";

const SIZE = 44;
const OFFSET = { top: 12, right: 16 };

function centre(screen: ScreenSize) {
	const at = cornerButton(screen, SIZE, OFFSET);
	return { x: screen.width - at.right - SIZE / 2, y: at.top + SIZE / 2 };
}

describe("corner button", () => {
	it("sits at its offset from the edges when the corners are square", () => {
		expect(cornerButton({ width: 393, height: 793 }, SIZE, OFFSET)).toEqual(OFFSET);
	});

	it("moves in from a rounded corner until it is as clear of the curve as of the edges", () => {
		const screen: ScreenSize = {
			width: 393,
			height: 793,
			corners: { radius: 55, curve: "continuous" },
		};
		const at = cornerButton(screen, SIZE, OFFSET);
		expect(at.top).toBeGreaterThan(OFFSET.top);
		expect(at.right).toBeGreaterThan(OFFSET.right);
		// Nothing left to push: a circle the button's size plus the gap already fits inside
		const { x, y } = centre(screen);
		const held = holdInside(screen, x, y, SIZE / 2 + OFFSET.right);
		expect(held.x).toBeCloseTo(x, 3);
		expect(held.y).toBeCloseTo(y, 3);
	});

	it("never comes closer to the edges than its offset", () => {
		const screen: ScreenSize = {
			width: 393,
			height: 793,
			corners: { radius: 20, curve: "circular" },
		};
		const at = cornerButton(screen, SIZE, OFFSET);
		expect(at.top).toBeGreaterThanOrEqual(OFFSET.top);
		expect(at.right).toBeGreaterThanOrEqual(OFFSET.right);
		expect(cornerExtent(screen)).toBeGreaterThan(0);
	});
});
