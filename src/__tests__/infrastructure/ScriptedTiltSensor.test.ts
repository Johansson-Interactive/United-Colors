import { attitudeAt, FLAT_ATTITUDES, wholeTilt } from "../../domain/levelPose";
import { ScriptedTiltSensor } from "../../infrastructure/ScriptedTiltSensor";

describe("ScriptedTiltSensor", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("plays the path from when it started, to every listener, until stopped", () => {
		let now = 1000;
		const sensor = new ScriptedTiltSensor(
			(s) => attitudeAt({ x: s, y: -s }, FLAT_ATTITUDES.up),
			() => now,
		);
		const a: number[] = [];
		const b: number[] = [];
		sensor.onSample((sample) => a.push(wholeTilt(sample, FLAT_ATTITUDES.up).x));
		const unsubscribe = sensor.onSample((sample) => b.push(wholeTilt(sample, FLAT_ATTITUDES.up).y));
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
