import { comboBonus, runSeconds } from "../../domain/run";
import type { RunCatch } from "../../domain/types";

const small = (step: number, value: number): RunCatch => ({
	tick: step,
	value,
	step,
	color: "#f00",
	point: false,
});

describe("comboBonus", () => {
	it("is 6 of the 9 three small dots in one combo pay", () => {
		expect(comboBonus({ catches: [small(1, 1), small(2, 3), small(3, 5)], ticks: 30 })).toBe(6);
	});

	it("is 0 for catches on their own and for a run without catches", () => {
		expect(comboBonus({ catches: [small(1, 1), small(1, 1)], ticks: 30 })).toBe(0);
		expect(comboBonus({ catches: [], ticks: 0 })).toBe(0);
	});
});

describe("runSeconds", () => {
	it("counts ticks at 30 Hz", () => {
		expect(runSeconds(90)).toBe(3);
		expect(runSeconds(45)).toBe(1.5);
	});
});
