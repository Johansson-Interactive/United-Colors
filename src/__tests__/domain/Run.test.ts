import { runSeconds } from "../../domain/run";

describe("run time", () => {
	it("is the run's ticks at 30 a second, unrounded", () => {
		expect(runSeconds(0)).toBe(0);
		expect(runSeconds(30)).toBe(1);
		expect(runSeconds(45)).toBe(1.5);
		expect(runSeconds(30 * 125 + 29)).toBeCloseTo(125.9667, 4);
	});
});
