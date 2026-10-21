import { comboPay, ownValue, runClock, runSeconds } from "../../domain/run";

describe("run time", () => {
	it("is the run's ticks at 30 a second, unrounded", () => {
		expect(runSeconds(0)).toBe(0);
		expect(runSeconds(30)).toBe(1);
		expect(runSeconds(45)).toBe(1.5);
		expect(runSeconds(30 * 125 + 29)).toBeCloseTo(125.9667, 4);
	});
});

describe("runClock", () => {
	it("shows the run time as M:SS, rounded down", () => {
		expect(runClock(0)).toBe("0:00");
		expect(runClock(29)).toBe("0:00");
		expect(runClock(30 * 9)).toBe("0:09");
		expect(runClock(30 * 84 + 15)).toBe("1:24");
		expect(runClock(30 * 600)).toBe("10:00");
	});
});

describe("comboPay", () => {
	it("pays two for every catch before this one in its combo, nothing on its own", () => {
		expect([1, 2, 3, 10].map(comboPay)).toEqual([0, 2, 4, 18]);
	});
});

describe("ownValue", () => {
	it("is what the catch paid less its combo bonus", () => {
		expect(ownValue({ value: 1, step: 1 })).toBe(1);
		expect(ownValue({ value: 3, step: 2 })).toBe(1);
		expect(ownValue({ value: 9, step: 3 })).toBe(5);
		expect(ownValue({ value: 5, step: 1 })).toBe(5);
	});
});
