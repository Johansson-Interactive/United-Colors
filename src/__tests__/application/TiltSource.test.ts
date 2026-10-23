import { createGameStore } from "../../application/GameStore";
import type { SensorPort, StoragePort } from "../../application/ports";
import { type TiltReading, TiltSource } from "../../application/TiltSource";
import { calibrateTilt } from "../../application/useCases/CalibrateTilt";
import { loadSettings } from "../../application/useCases/LoadSettings";
import { FLAT, gravityAt } from "../../domain/levelPose";
import type { GameSettings, Gravity } from "../../domain/types";

function memoryStorage(initial: GameSettings): StoragePort {
	let settings = initial;
	return {
		loadHighScore: async () => 0,
		saveHighScore: async () => {},
		loadSettings: async () => settings,
		saveSettings: async (s) => {
			settings = s;
		},
	};
}

/** A sensor the test feeds by hand */
function handSensor() {
	const listeners = new Set<(gravity: Gravity) => void>();
	let started = false;
	const sensor: SensorPort = {
		start: () => {
			started = true;
		},
		stop: () => {
			started = false;
		},
		onSample: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	return {
		sensor,
		hold: (gravity: Gravity) => {
			for (const listener of listeners) listener(gravity);
		},
		get started() {
			return started;
		},
		get listening() {
			return listeners.size;
		},
	};
}

const DEG = Math.PI / 180;

const UPRIGHT = gravityAt({ x: 0, y: 90 * DEG }, FLAT.up);
const RECLINED = gravityAt({ x: 0, y: 45 * DEG }, FLAT.up);

const UNSET: GameSettings = {
	soundEnabled: true,
	musicEnabled: true,
	tiltSensitivity: 1,
	levelPoses: { up: null, down: null },
};

/** A started tilt source on a hand sensor, over a store holding `settings`, and its readings */
function setup(settings: Partial<GameSettings> = {}) {
	const store = createGameStore();
	store.getState().updateSettings(settings);
	const hand = handSensor();
	const source = new TiltSource(hand.sensor, store);
	const readings: TiltReading[] = [];
	source.onReading((reading) => readings.push(reading));
	source.start();
	/** How far the latest reading is from level */
	const tilt = () => {
		const latest = readings.at(-1);
		if (!latest) throw new Error("no reading");
		return Math.hypot(latest.x, latest.y);
	};
	return { store, hand, source, readings, tilt };
}

describe("calibrateTilt", () => {
	it("stores the pose and keeps the other settings", async () => {
		const store = createGameStore();
		const storage = memoryStorage({ ...UNSET, soundEnabled: false });
		await loadSettings(store, storage);
		await calibrateTilt({ x: 0.5, y: -0.3, z: -0.8 }, "up", store, storage);
		expect(store.getState().settings).toEqual({
			soundEnabled: false,
			musicEnabled: true,
			tiltSensitivity: 1,
			levelPoses: { up: { x: 0.5, y: -0.3, z: -0.8 }, down: null },
		});
	});

	it("keeps a pose set turned over apart from the screen-up one", async () => {
		const store = createGameStore();
		const storage = memoryStorage(UNSET);
		await calibrateTilt({ x: 0.5, y: -0.3, z: -0.8 }, "up", store, storage);
		await calibrateTilt({ x: 0.1, y: 0.2, z: 1 }, "down", store, storage);
		const both = { up: { x: 0.5, y: -0.3, z: -0.8 }, down: { x: 0.1, y: 0.2, z: 1 } };
		expect(store.getState().settings.levelPoses).toEqual(both);
		const reloaded = createGameStore();
		await loadSettings(reloaded, storage);
		expect(reloaded.getState().settings.levelPoses).toEqual(both);
	});
});

describe("TiltSource", () => {
	it("owns the sensor: reads only while started, and starts and stops it", () => {
		const store = createGameStore();
		const hand = handSensor();
		const source = new TiltSource(hand.sensor, store);
		const readings: TiltReading[] = [];
		source.onReading((reading) => readings.push(reading));
		hand.hold(FLAT.up);
		expect(readings).toHaveLength(0);
		source.start();
		expect(hand.started).toBe(true);
		hand.hold(FLAT.up);
		expect(readings).toHaveLength(1);
		source.stop();
		expect(hand.started).toBe(false);
		expect(hand.listening).toBe(0);
		hand.hold(FLAT.up);
		expect(readings).toHaveLength(1);
	});

	it("reads tilt from flat until a level pose is set", () => {
		const { hand, readings } = setup();
		const tipped = gravityAt({ x: 0.3, y: -0.2 }, FLAT.up);
		hand.hold(tipped);
		expect(readings[0].x).toBeCloseTo(0.3);
		expect(readings[0].y).toBeCloseTo(-0.2);
		expect(readings[0]).toMatchObject({ side: "up", gravity: tipped });
	});

	it("reads the saved level pose as level", () => {
		const desk = gravityAt({ x: 0.5, y: 0.3 }, FLAT.up);
		const { hand, tilt } = setup({ levelPoses: { up: desk, down: null } });
		hand.hold(desk);
		expect(tilt()).toBeCloseTo(0);
	});

	it("turned over, reads from the screen-down pose", () => {
		const overhead = gravityAt({ x: 0.5, y: 0 }, FLAT.down);
		const { hand, readings, tilt } = setup({ levelPoses: { up: FLAT.up, down: overhead } });
		hand.hold(overhead);
		expect(readings.at(-1)?.side).toBe("down");
		expect(tilt()).toBeCloseTo(0);
	});

	it("gives every listener the same reading, so the game and the interface agree", () => {
		const { source, hand, readings } = setup();
		const other: TiltReading[] = [];
		source.onReading((reading) => other.push(reading));
		hand.hold(UPRIGHT);
		expect(other[0]).toBe(readings.at(-1));
	});

	it("keeps the pose in use near upright, whichever way the phone is turning", () => {
		const { hand, readings } = setup();
		hand.hold(gravityAt({ x: 0, y: 125 * DEG }, FLAT.up));
		expect(readings.at(-1)?.side).toBe("down");
		hand.hold(gravityAt({ x: 0, y: 80 * DEG }, FLAT.up));
		expect(readings.at(-1)?.side).toBe("down");
		hand.hold(gravityAt({ x: 0, y: 50 * DEG }, FLAT.up));
		expect(readings.at(-1)?.side).toBe("up");
	});

	it("reads the latest gravity again as soon as a pose changes", async () => {
		const { store, hand, readings, tilt } = setup();
		hand.hold(RECLINED);
		expect(tilt()).toBeCloseTo(45 * DEG);
		await calibrateTilt(RECLINED, "up", store, memoryStorage(UNSET));
		expect(readings).toHaveLength(2);
		expect(tilt()).toBeCloseTo(0);
	});
});
