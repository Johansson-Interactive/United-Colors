import { GAME_COLORS } from "../../domain/constants";

/**
 * Visual language of Tiltling: everything is a dot.
 * Ink background makes the three game colors glow; UI chrome reuses them.
 */
export const INK = "#0B0E14";
export const INK_LIFT = "#151B28";
export const WHITE = "#F4F6FB";
/** Pure black, matching the phone's glass, over the safe-area insets the playfield keeps clear of */
export const BEZEL = "#000000";

export const TRIO = GAME_COLORS;

/** Score pops for catches that carry a combo on (Amber 500) */
export const COMBO_AMBER = "#FFC107";

/** Diameter of the big ring shared by the title, level and pause screens */
export const BOWL_SIZE = 236;

/** Diameter of the setting dots in the screen corners, and how far they sit from the edge */
export const CORNER_DOT_SIZE = 44;
export const CORNER_INSET = 20;

const MUTED = "rgba(244,246,251,0.55)";

/** Glyph colour of a setting that is off or not chosen */
export const DIM = "rgba(244,246,251,0.45)";

/** Small caption style shared by overlays (system font, spaced caps) */
export const CAPTION = {
	fontSize: 11,
	fontWeight: "700" as const,
	letterSpacing: 3,
	color: MUTED,
	textTransform: "uppercase" as const,
	textAlign: "center" as const,
};
