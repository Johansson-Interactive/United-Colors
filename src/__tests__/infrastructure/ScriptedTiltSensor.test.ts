import { FLAT_GRAVITY, gravityAt } from "../../domain/tilt";
import { ScriptedTiltSensor } from "../../infrastructure/ScriptedTiltSensor";
import { tiltFrom } from "../fixtures/tiltFrom";

describe("ScriptedTiltSensor", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("plays the path from when it started, to every listener, until stopped", () => {
		let now = 1000;
		const sensor = new ScriptedTiltSensor(
			(s) => gravityAt({ x: s, y: -s }, FLAT_GRAVITY),
			() => now,
		);
		const a: number[] = [];
		const b: number[] = [];
		sensor.onSample((sample) => a.push(tiltFrom(sample.gravity).x));
		const unsubscribe = sensor.onSample((sample) => b.push(tiltFrom(sample.gravity).y));
		sensor.start();
		now = 1500;
		vi.advanceTimersByTime(17);
		unsubscribe();
		now = 2000;
		vi.advanceTimersByTime(17);
		sensor.stop();
		vi.advanceTimersByTime(100);
		expect(a[0]).toBeCloseTo(0.5);
		expect(a[1]).toBeCloseTo(1);
		expect(a).toHaveLength(2);
		expect(b).toHaveLength(1);
		expect(b[0]).toBeCloseTo(-0.5);
	});
});
