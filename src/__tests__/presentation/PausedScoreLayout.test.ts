import { layoutDotMatrix } from "../../presentation/dotmatrix/layout";
import {
	MIDDLE_PITCH,
	middlePitch,
	middleSpot,
	TIME_GAP,
	TIME_PITCH,
} from "../../presentation/layout/pausedScore";

const STAGE = { width: 390, height: 800 };

describe("the paused score's place", () => {
	it("is set at the middle pitch, closer only for a score too wide for the stage", () => {
		expect(middlePitch(47, STAGE.width)).toBe(MIDDLE_PITCH);
		expect(middlePitch(0, STAGE.width)).toBe(MIDDLE_PITCH);
		const wide = 1234567;
		const pitch = middlePitch(wide, STAGE.width);
		expect(pitch).toBeLessThan(MIDDLE_PITCH);
		expect(layoutDotMatrix(String(wide)).cols * pitch).toBeLessThanOrEqual(STAGE.width);
	});

	it("centres the score and the time, as a pair, on the stage", () => {
		const { scoreY, timeY } = middleSpot(STAGE.height, MIDDLE_PITCH);
		const scoreTop = scoreY - (7 * MIDDLE_PITCH) / 2;
		const timeBottom = timeY + (7 * TIME_PITCH) / 2;
		expect(scoreTop + timeBottom).toBeCloseTo(STAGE.height, 9);
		expect(timeY - (7 * TIME_PITCH) / 2 - (scoreY + (7 * MIDDLE_PITCH) / 2)).toBe(TIME_GAP);
	});
});
