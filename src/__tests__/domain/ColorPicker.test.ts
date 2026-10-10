import { GAME_COLORS } from "../../domain/constants";
import { ColorPicker } from "../../domain/engine/ColorPicker";

function sequence(...rolls: number[]): () => number {
	let i = 0;
	return () => rolls[i++];
}

function expectProbabilities(picker: ColorPicker, expected: number[]) {
	picker.getProbabilities().forEach((p, i) => {
		expect(p).toBeCloseTo(expected[i], 10);
	});
}

describe("ColorPicker", () => {
	it("starts with equal probability for each color", () => {
		expectProbabilities(new ColorPicker(Math.random), [1 / 3, 1 / 3, 1 / 3]);
	});

	it("divides the picked color's probability by three and shares the rest equally", () => {
		// 0.5 falls in the second third -> GAME_COLORS[1]
		const picker = new ColorPicker(sequence(0.5));
		expect(picker.next()).toBe(GAME_COLORS[1]);
		expectProbabilities(picker, [4 / 9, 1 / 9, 4 / 9]);
	});

	it("keeps adjusting from the previous probabilities", () => {
		// Pick [1] -> [4/9, 1/9, 4/9]; then 0.0 picks [0] -> [0] is 4/27, others gain 4/27 each
		const picker = new ColorPicker(sequence(0.5, 0));
		picker.next();
		expect(picker.next()).toBe(GAME_COLORS[0]);
		expectProbabilities(picker, [4 / 27, 7 / 27, 16 / 27]);
	});

	it("can still repeat a color, just less likely", () => {
		// After picking [1], it occupies [4/9, 5/9)
		const picker = new ColorPicker(sequence(0.5, 0.5));
		picker.next();
		expect(picker.next()).toBe(GAME_COLORS[1]);
	});

	it("never picks an excluded color", () => {
		const picker = new ColorPicker(Math.random);
		for (let i = 0; i < 1000; i++) {
			expect(picker.next(GAME_COLORS[2])).not.toBe(GAME_COLORS[2]);
		}
	});

	it("spreads the roll over the remaining weights when excluding", () => {
		// Excluding [0] leaves [1] and [2] at 1/3 each: rolls below 0.5 pick [1], above pick [2]
		const picker = new ColorPicker(sequence(0.49, 0.99));
		expect(picker.next(GAME_COLORS[0])).toBe(GAME_COLORS[1]);
		// Now [0] 4/9, [1] 1/9, [2] 4/9; excluding [0] -> [1] is 1/5 of the roll, [2] 4/5
		expect(picker.next(GAME_COLORS[0])).toBe(GAME_COLORS[2]);
	});

	it("updates weights the same way when excluding", () => {
		const picker = new ColorPicker(sequence(0.1));
		picker.next(GAME_COLORS[0]);
		expectProbabilities(picker, [4 / 9, 1 / 9, 4 / 9]);
	});

	it("keeps probabilities summing to one", () => {
		const picker = new ColorPicker(Math.random);
		for (let i = 0; i < 1000; i++) picker.next();
		const sum = picker.getProbabilities().reduce((a, b) => a + b, 0);
		expect(sum).toBeCloseTo(1, 10);
	});

	it("reset restores equal probabilities", () => {
		const picker = new ColorPicker(sequence(0.1, 0.9));
		picker.next();
		picker.next();
		picker.reset();
		expectProbabilities(picker, [1 / 3, 1 / 3, 1 / 3]);
	});
});
