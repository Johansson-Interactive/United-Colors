import { GAME_COLORS } from "../../domain/constants";

/**
 * Visual language of United Colors: everything is a dot.
 * Ink background makes the three game colors glow; UI chrome reuses them.
 */
export const INK = "#0B0E14";
export const INK_LIFT = "#151B28";
export const WHITE = "#F4F6FB";

export const TRIO = GAME_COLORS;
export const PINK = GAME_COLORS[0];
export const BLUE = GAME_COLORS[1];
export const GREEN = GAME_COLORS[2];

/** Diameter of the big ring shared by the title, level and pause screens */
export const BOWL_SIZE = 236;

export const MUTED = "rgba(244,246,251,0.55)";
export const FAINT = "rgba(244,246,251,0.22)";

/** Small caption style shared by overlays (system font, spaced caps) */
export const CAPTION = {
	fontSize: 11,
	fontWeight: "700" as const,
	letterSpacing: 3,
	color: MUTED,
	textTransform: "uppercase" as const,
	textAlign: "center" as const,
};

/** Translucent alpha helper for hex colors (#RRGGBB) */
export function withAlpha(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r},${g},${b},${alpha})`;
}
