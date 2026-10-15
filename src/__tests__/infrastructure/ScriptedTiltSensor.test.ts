import { ScriptedTiltSensor } from "../../infrastructure/ScriptedTiltSensor";

describe("ScriptedTiltSensor", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("plays the path from when it started, to every listener, until stopped", () => {
		let now = 1000;
		const sensor = new ScriptedTiltSensor(
			(s) => ({ x: s, y: -s, facingDown: false }),
			() => now,
		);
		const a: number[] = [];
		const b: number[] = [];
		sensor.onSample((sample) => a.push(sample.x));
		const unsubscribe = sensor.onSample((sample) => b.push(sample.y));
		sensor.start();
		now = 1500;
		vi.advanceTimersByTime(17);
		unsubscribe();
		now = 2000;
		vi.advanceTimersByTime(17);
		sensor.stop();
		vi.advanceTimersByTime(100);
		expect(a).toEqual([0.5, 1]);
		expect(b).toEqual([-0.5]);
	});
});
