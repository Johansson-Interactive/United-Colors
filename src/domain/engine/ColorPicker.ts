import { COLOR_REPEAT_FACTOR, GAME_COLORS } from "../constants";

export type GameColor = (typeof GAME_COLORS)[number];

/**
 * Picks game colors with weights that discourage repeats.
 * Starts uniform; each pick multiplies the picked color's probability by
 * COLOR_REPEAT_FACTOR and splits the removed share equally among the other colors.
 * E.g. with three colors: 1/3 each -> pick blue -> blue 1/9, others 4/9 each.
 */
export class ColorPicker {
	private weights: number[] = [];
	private random: () => number;

	constructor(random: () => number) {
		this.random = random;
		this.reset();
	}

	reset(): void {
		this.weights = GAME_COLORS.map(() => 1 / GAME_COLORS.length);
	}

	/** Current probability per color, in GAME_COLORS order */
	getProbabilities(): readonly number[] {
		return this.weights;
	}

	/**
	 * Pick a color. An excluded color can't be picked; the roll is spread over the
	 * remaining colors' weights.
	 */
	next(exclude?: string): GameColor {
		const allowed = this.weights.map((w, i) => (GAME_COLORS[i] === exclude ? 0 : w));
		const total = allowed.reduce((a, b) => a + b, 0);
		const roll = this.random() * total;
		let index = allowed.findLastIndex((w) => w > 0);
		let cumulative = 0;
		for (let i = 0; i < allowed.length; i++) {
			cumulative += allowed[i];
			if (roll < cumulative) {
				index = i;
				break;
			}
		}

		const removed = this.weights[index] * (1 - COLOR_REPEAT_FACTOR);
		const share = removed / (this.weights.length - 1);
		this.weights = this.weights.map((w, i) => (i === index ? w - removed : w + share));

		return GAME_COLORS[index];
	}
}
