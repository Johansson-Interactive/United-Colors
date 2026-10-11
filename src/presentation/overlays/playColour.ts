import { TRIO } from "../theme/theme";

/**
 * Input positions for the play dot's colour, over one cycle of three colours. Each pair
 * (`PLAY_INPUT[i]`, `PLAY_INPUT[i + 1]`) with an even `i` is a hold on one colour; the gaps
 * between them are the blends into the next colour.
 */
export const PLAY_INPUT = [0, 0.88, 1, 1.88, 2, 2.88, 3] as const;
export const PLAY_OUTPUT = [TRIO[0], TRIO[0], TRIO[1], TRIO[1], TRIO[2], TRIO[2], TRIO[0]] as const;

type Blend = (value: number, input: readonly number[], output: readonly string[]) => string;

/**
 * The play dot's colour at `position` (in [0, 3)). Inside a hold it is the exact `TRIO` string,
 * so the blurred circle keeps the same paint and skips re-rasterizing; only blends call `blend`
 * (Reanimated's `interpolateColor` in the overlay). Worklet-safe: pass the blend in, don't import it.
 */
export function playColourAt(position: number, blend: Blend): string {
	"worklet";
	for (let i = 0; i < PLAY_INPUT.length - 1; i += 2) {
		if (position >= PLAY_INPUT[i] && position <= PLAY_INPUT[i + 1]) return PLAY_OUTPUT[i];
	}
	return blend(position, PLAY_INPUT, PLAY_OUTPUT);
}
