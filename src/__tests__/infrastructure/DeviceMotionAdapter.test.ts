import { DeviceMotion } from "expo-sensors";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Rotation = { alpha: number; beta: number; gamma: number };
type MotionListener = (data: { rotation?: Rotation }) => void;

const motion = vi.hoisted(() => ({
	listeners: new Set<MotionListener>(),
	hasGyroscope: true,
}));

vi.mock("expo-sensors", () => ({
	DeviceMotion: {
		setUpdateInterval: vi.fn(),
		addListener: (listener: MotionListener) => {
			motion.listeners.add(listener);
			return { remove: () => motion.listeners.delete(listener) };
		},
	},
	Gyroscope: {
		isAvailableAsync: () => Promise.resolve(motion.hasGyroscope),
	},
}));

import { gravityOf, turnBetween } from "../../domain/levelPose";
import { DeviceMotionAdapter } from "../../infrastructure/DeviceMotionAdapter";

function emit(beta: number, gamma: number, alpha = 0) {
	for (const listener of motion.listeners) listener({ rotation: { alpha, beta, gamma } });
}

/** Let the adapter's gyroscope check settle */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function started(sensor = new DeviceMotionAdapter()) {
	sensor.start();
	await settle();
	return sensor;
}

describe("DeviceMotionAdapter", () => {
	beforeEach(() => {
		motion.listeners.clear();
		motion.hasGyroscope = true;
		vi.clearAllMocks();
	});

	it("requests every available motion update on each start", async () => {
		const sensor = await started();
		expect(DeviceMotion.setUpdateInterval).toHaveBeenCalledExactlyOnceWith(0);
		sensor.stop();

		vi.clearAllMocks();
		await started(sensor);
		expect(DeviceMotion.setUpdateInterval).toHaveBeenCalledExactlyOnceWith(0);
		sensor.stop();
	});

	it("reports the attitude of the three angles, its gravity the old formula's", async () => {
		const sensor = new DeviceMotionAdapter();
		const listener = vi.fn();
		sensor.onSample(listener);
		await started(sensor);

		// Top edge raised 0.7, right edge lowered 0.4, swivelled 2 radians
		emit(0.7, 0.4, 2);

		const g = gravityOf(listener.mock.calls[0][0]);
		expect(g.x).toBeCloseTo(Math.cos(0.7) * Math.sin(0.4));
		expect(g.y).toBeCloseTo(-Math.sin(0.7));
		expect(g.z).toBeCloseTo(-Math.cos(0.7) * Math.cos(0.4));
	});

	it("keeps the swivel gravity cannot see", async () => {
		const sensor = new DeviceMotionAdapter();
		const listener = vi.fn();
		sensor.onSample(listener);
		await started(sensor);

		// Upright, then turned 0.3 about the vertical
		emit(Math.PI / 2, 0, 0);
		emit(Math.PI / 2, 0, 0.3);

		const [[facing], [turned]] = listener.mock.calls;
		expect(turnBetween(facing, turned)).toBeCloseTo(0.3);
	});

	it("reports nothing on a phone without a gyroscope", async () => {
		motion.hasGyroscope = false;
		const sensor = new DeviceMotionAdapter();
		const listener = vi.fn();
		sensor.onSample(listener);
		await started(sensor);

		emit(0.1, 0.2);

		expect(motion.listeners.size).toBe(0);
		expect(listener).not.toHaveBeenCalled();
	});

	it("does not subscribe if stopped before the gyroscope check answers", async () => {
		const sensor = new DeviceMotionAdapter();
		sensor.start();
		sensor.stop();
		await settle();

		expect(motion.listeners.size).toBe(0);
	});

	it("feeds every listener from one native subscription", async () => {
		const sensor = new DeviceMotionAdapter();
		const a = vi.fn();
		const b = vi.fn();
		sensor.onSample(a);
		sensor.onSample(b);
		sensor.start();
		sensor.start();
		await settle();

		emit(0.1, 0.2);

		expect(motion.listeners.size).toBe(1);
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
		expect(b.mock.calls[0][0]).toBe(a.mock.calls[0][0]);
	});

	it("stops feeding a listener once it unsubscribes, and keeps feeding the rest", async () => {
		const sensor = new DeviceMotionAdapter();
		const a = vi.fn();
		const b = vi.fn();
		const unsubscribeA = sensor.onSample(a);
		sensor.onSample(b);
		await started(sensor);

		unsubscribeA();
		emit(0.1, 0.2);

		expect(a).not.toHaveBeenCalled();
		expect(b).toHaveBeenCalledTimes(1);
	});

	it("keeps its listeners across a stop and start", async () => {
		const sensor = new DeviceMotionAdapter();
		const listener = vi.fn();
		sensor.onSample(listener);
		await started(sensor);
		sensor.stop();
		expect(motion.listeners.size).toBe(0);

		await started(sensor);
		emit(0.1, 0.2);

		expect(listener).toHaveBeenCalledTimes(1);
	});
});
