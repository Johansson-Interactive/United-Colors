import { GAME_COLORS } from "../../domain/constants";

/**
 * Visual language of United Colors: everything is a dot.
 * Ink background makes the three game colors glow; UI chrome reuses them.
 */
export const INK = "#0B0E14";
export const INK_LIFT = "#151B28";
export const WHITE = "#F4F6FB";

export const TRIO = GAME_COLORS;

/** Diameter of the big ring shared by the title, level and pause screens */
export const BOWL_SIZE = 236;

const MUTED = "rgba(244,246,251,0.55)";

/** Small caption style shared by overlays (system font, spaced caps) */
export const CAPTION = {
	fontSize: 11,
	fontWeight: "700" as const,
	letterSpacing: 3,
	color: MUTED,
	textTransform: "uppercase" as const,
	textAlign: "center" as const,
};
