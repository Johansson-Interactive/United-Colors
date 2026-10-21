import { GAME_COLORS } from "../../domain/constants";
import { comboPay } from "../../domain/run";

/**
 * Visual language of Tiltling: everything is a dot.
 * Ink background makes the three game colors glow; UI chrome reuses them.
 */
export const INK = "#0B0E14";
export const INK_LIFT = "#151B28";
export const WHITE = "#F4F6FB";

/** WHITE at `alpha`, for interface ink that steps back */
export function whiteAt(alpha: number): string {
	return `rgba(244,246,251,${alpha})`;
}

/** Clear white at `alpha`: the glazes, rims and glare laid over the ink like glass */
export function glass(alpha: number): string {
	return `rgba(255,255,255,${alpha})`;
}

/** Black at `alpha`: the shadows the dots cast */
export function shade(alpha: number): string {
	return `rgba(0,0,0,${alpha})`;
}
/** Pure black, matching the phone's glass, over the safe-area insets the playfield keeps clear of */
export const BEZEL = "#000000";

export const TRIO = GAME_COLORS;

/** Score pops for catches that carry a combo on (Amber 500) */
export const COMBO_AMBER = "#FFC107";

/**
 * The colour a catch's pay shows in, a catch of `color` at combo step `step`: combo amber once
 * it pays a combo bonus (see comboPay), from a combo's second catch on; its own colour before
 */
export function payColor(step: number, color: string): string {
	return comboPay(step) > 0 ? COMBO_AMBER : color;
}

/** Diameter of the big ring shared by the title, level and pause screens */
export const BOWL_SIZE = 236;

/** The bowl's glass: clear in the middle, glazing towards the rim, at BOWL_GLAZE_STOPS */
export const BOWL_GLAZE = [glass(0), glass(0.02), glass(0.09)];
export const BOWL_GLAZE_STOPS = [0.3, 0.8, 1];
/** The bowl's rim line, and the mark at its centre */
export const BOWL_RIM = glass(0.14);
export const BOWL_MARK = glass(0.35);

/** Diameter of the setting dots in the screen corners, and how far they sit from the edge */
export const CORNER_DOT_SIZE = 44;
export const CORNER_INSET = 20;

const MUTED = whiteAt(0.55);

/** Glyph colour of a setting that is off or not chosen */
export const DIM = whiteAt(0.45);

/** Small caption style shared by overlays (system font, spaced caps) */
export const CAPTION = {
	fontSize: 11,
	fontWeight: "700" as const,
	letterSpacing: 3,
	color: MUTED,
	textTransform: "uppercase" as const,
	textAlign: "center" as const,
};
