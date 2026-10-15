import { describe, expect, it } from "vitest";
import { stageBox } from "../../presentation/layout/stageBox";

describe("stage box", () => {
	it("starts below the top inset and runs to the bottom of the window, under the home indicator", () => {
		expect(stageBox(393, 852, { top: 59, left: 0, right: 0, bottom: 34 })).toEqual({
			top: 59,
			left: 0,
			width: 393,
			height: 793,
		});
	});

	it("keeps clear of the side insets", () => {
		expect(stageBox(852, 393, { top: 0, left: 59, right: 47, bottom: 21 })).toEqual({
			top: 0,
			left: 59,
			width: 746,
			height: 393,
		});
	});

	it("never comes out negative before the insets are known", () => {
		expect(stageBox(0, 0, { top: 59, left: 10, right: 10, bottom: 34 })).toEqual({
			top: 59,
			left: 10,
			width: 0,
			height: 0,
		});
	});
});
