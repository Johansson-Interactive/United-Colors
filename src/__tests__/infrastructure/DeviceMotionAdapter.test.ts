import { DeviceMotion } from "expo-sensors";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MotionListener = (data: { rotation?: { beta: number; gamma: number } }) => void;

const motion = vi.hoisted(() => ({
	listeners: new Set<MotionListener>(),
}));

vi.mock("expo-sensors", () => ({
	DeviceMotion: {
		setUpdateInterval: vi.fn(),
		addListener: (listener: MotionListener) => {
			motion.listeners.add(listener);
			return { remove: () => motion.listeners.delete(listener) };
		},
	},
}));

import { DeviceMotionAdapter } from "../../infrastructure/DeviceMotionAdapter";

function emit(beta: number, gamma: number) {
	for (const listener of motion.listeners) listener({ rotation: { beta, gamma } });
}

describe("DeviceMotionAdapter", () => {
	beforeEach(() => {
		motion.listeners.clear();
		vi.clearAllMocks();
	});

	it("requests every available motion update on each start", () => {
		const sensor = new DeviceMotionAdapter();
		sensor.start();
		expect(DeviceMotion.setUpdateInterval).toHaveBeenCalledExactlyOnceWith(0);
		sensor.stop();

		vi.clearAllMocks();
		sensor.start();
		expect(DeviceMotion.setUpdateInterval).toHaveBeenCalledExactlyOnceWith(0);
		sensor.stop();
	});

	it("feeds every listener from one native subscription", () => {
		const sensor = new DeviceMotionAdapter();
		const a = vi.fn();
		const b = vi.fn();
		sensor.onSample(a);
		sensor.onSample(b);
		sensor.start();
		sensor.start();

		emit(0.1, 0.2);

		expect(motion.listeners.size).toBe(1);
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
		expect(b.mock.calls[0][0]).toBe(a.mock.calls[0][0]);
	});

	it("stops feeding a listener once it unsubscribes, and keeps feeding the rest", () => {
		const sensor = new DeviceMotionAdapter();
		const a = vi.fn();
		const b = vi.fn();
		const unsubscribeA = sensor.onSample(a);
		sensor.onSample(b);
		sensor.start();

		unsubscribeA();
		emit(0.1, 0.2);

		expect(a).not.toHaveBeenCalled();
		expect(b).toHaveBeenCalledTimes(1);
	});

	it("keeps its listeners across a stop and start", () => {
		const sensor = new DeviceMotionAdapter();
		const listener = vi.fn();
		sensor.onSample(listener);
		sensor.start();
		sensor.stop();
		expect(motion.listeners.size).toBe(0);

		sensor.start();
		emit(0.1, 0.2);

		expect(listener).toHaveBeenCalledTimes(1);
	});
});
