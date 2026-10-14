import { layoutDotMatrix, matrixBox, pitchToFit } from "../dotmatrix/layout";
import { BOWL_SIZE } from "../theme/theme";

/**
 * Where the big bowl sits. The title screen sets it: its name, the bowl and the caption form one
 * group, centred above the footer and lifted a little. Every other bowl screen (level, speed,
 * pause) puts its bowl in exactly the same place, with its caption the same distance below, so
 * moving between them only changes what is in the bowl.
 */

/** The game's name on the title screen */
export const TITLE = "TILTLING";
/** Share of the screen width the title's dots span, and its pitch bounds */
const TITLE_WIDTH = 0.86;
const TITLE_PITCH = { min: 6, max: 11 };
/** Share of the screen height the title group sits above centre, so the top isn't left empty */
const GROUP_LIFT = 0.03;
/** Height of the title screen's footer, which holds the best score */
export const TITLE_FOOTER_HEIGHT = 96;

/** Space between the bowl and what sits right above it (the title) and below it (the caption) */
export const BOWL_GAP = 26;
export const CAPTION_LINE_HEIGHT = 20;

const titleLayout = layoutDotMatrix(TITLE);

/** Pitch of the title: as wide as fits the screen, within bounds */
export function titlePitch(windowWidth: number): number {
	return Math.max(
		TITLE_PITCH.min,
		pitchToFit(titleLayout, windowWidth * TITLE_WIDTH, TITLE_PITCH.max),
	);
}

export interface BowlStageLayout {
	/** Top of the bowl, from the top of the stage */
	bowlTop: number;
	/** Bottom of whatever sits above the bowl */
	aboveBottom: number;
	/** Top of the caption below the bowl */
	captionTop: number;
}

/**
 * The bowl's place on a stage `stageHeight` tall, on a `windowWidth` x `windowHeight` screen.
 * It is where the title screen's centred group (title, bowl, one caption line) puts it.
 */
export function bowlStageLayout(
	stageHeight: number,
	windowWidth: number,
	windowHeight: number,
): BowlStageLayout {
	const titleHeight = matrixBox(titleLayout, titlePitch(windowWidth), true, true).height;
	const room = stageHeight - TITLE_FOOTER_HEIGHT - windowHeight * GROUP_LIFT * 2;
	const group = titleHeight + BOWL_GAP + BOWL_SIZE + BOWL_GAP + CAPTION_LINE_HEIGHT;
	const bowlTop = (room - group) / 2 + titleHeight + BOWL_GAP;
	return {
		bowlTop,
		aboveBottom: bowlTop - BOWL_GAP,
		captionTop: bowlTop + BOWL_SIZE + BOWL_GAP,
	};
}
