import {
	SCORE_BUMP_MS,
	SCORE_BUMP_PEAK,
	scoreBumpScale,
} from "../../presentation/effects/scoreBump";

const FRAME_MS = 1000 / 60;

describe("scoreBumpScale", () => {
	it("rests at exactly 1 before, at the end of and after a bump", () => {
		expect(scoreBumpScale(0)).toBe(1);
		expect(scoreBumpScale(1)).toBe(1);
		expect(scoreBumpScale(1.5)).toBe(1);
	});

	it("swells to the peak quickly, then wobbles below rest on the way back like a spring", () => {
		const frames = Math.ceil(SCORE_BUMP_MS / FRAME_MS);
		const scales = Array.from({ length: frames }, (_, i) =>
			scoreBumpScale((i * FRAME_MS) / SCORE_BUMP_MS),
		);
		const peakAt = scales.indexOf(Math.max(...scales));
		expect(Math.max(...scales)).toBeCloseTo(SCORE_BUMP_PEAK, 1);
		expect(peakAt * FRAME_MS).toBeLessThan(100);
		expect(Math.min(...scales.slice(peakAt))).toBeLessThan(0.95);
	});

	it("is continuous, so the end of a bump does not snap", () => {
		let previous = scoreBumpScale(0);
		for (let ms = 1; ms <= SCORE_BUMP_MS; ms++) {
			const scale = scoreBumpScale(ms / SCORE_BUMP_MS);
			expect(Math.abs(scale - previous)).toBeLessThan(0.02);
			previous = scale;
		}
	});

	it("is over within a second, so a catch animates the score for a bounded run of frames", () => {
		expect(SCORE_BUMP_MS).toBeLessThan(1000);
	});
});
