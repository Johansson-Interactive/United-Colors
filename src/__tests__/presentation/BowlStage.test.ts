import { describe, expect, it } from "vitest";
import { layoutDotMatrix, matrixBox } from "../../presentation/dotmatrix/layout";
import {
	BOWL_GAP,
	bowlStageLayout,
	CAPTION_LINE_HEIGHT,
	TITLE,
	TITLE_FOOTER_HEIGHT,
	titlePitch,
} from "../../presentation/layout/bowlStage";
import { BOWL_SIZE } from "../../presentation/theme/theme";

const WINDOW = { width: 393, height: 852 };
const STAGE = 759;

describe("bowl stage", () => {
	it("centres the title screen's group of title, bowl and caption above its footer, lifted", () => {
		const title = matrixBox(layoutDotMatrix(TITLE), titlePitch(WINDOW.width), true, true).height;
		const { aboveBottom, captionTop } = bowlStageLayout(STAGE, WINDOW.width, WINDOW.height);
		const groupTop = aboveBottom - title;
		const groupBottom = captionTop + CAPTION_LINE_HEIGHT;
		const lift = WINDOW.height * 0.03 * 2;
		const spaceBelow = STAGE - TITLE_FOOTER_HEIGHT - lift - groupBottom;
		expect(groupTop).toBeCloseTo(spaceBelow);
	});

	it("keeps the title and the caption the same gap from the bowl", () => {
		const { bowlTop, aboveBottom, captionTop } = bowlStageLayout(
			STAGE,
			WINDOW.width,
			WINDOW.height,
		);
		expect(bowlTop - aboveBottom).toBe(BOWL_GAP);
		expect(captionTop - (bowlTop + BOWL_SIZE)).toBe(BOWL_GAP);
	});

	it("moves the bowl half of any extra stage height", () => {
		const short = bowlStageLayout(STAGE, WINDOW.width, WINDOW.height);
		const tall = bowlStageLayout(STAGE + 100, WINDOW.width, WINDOW.height);
		expect(tall.bowlTop - short.bowlTop).toBeCloseTo(50);
	});

	it("leaves room for a wider title's taller glyphs on a wider screen", () => {
		const narrow = bowlStageLayout(STAGE, 320, WINDOW.height);
		const wide = bowlStageLayout(STAGE, 430, WINDOW.height);
		expect(wide.bowlTop).toBeGreaterThan(narrow.bowlTop);
	});
});
