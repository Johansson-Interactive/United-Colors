import { createGameStore } from "../../application/GameStore";
import type { SensorPort, StoragePort } from "../../application/ports";
import { type TiltReading, TiltSource } from "../../application/TiltSource";
import { calibrateTilt } from "../../application/useCases/CalibrateTilt";
import { loadSettings } from "../../application/useCases/LoadSettings";
import { attitudeAt, FLAT_ATTITUDES, gravityOf } from "../../domain/levelPose";
import type { Attitude, GameSettings } from "../../domain/types";
import { swivelled } from "../domain/attitudes";

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
	const listeners = new Set<(attitude: Attitude) => void>();
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
		hold: (attitude: Attitude) => {
			for (const listener of listeners) listener(attitude);
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

const UPRIGHT = attitudeAt({ x: 0, y: 90 * DEG }, FLAT_ATTITUDES.up);
const RECLINED = attitudeAt({ x: 0, y: 45 * DEG }, FLAT_ATTITUDES.up);

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
	let time = 0;
	const source = new TiltSource(hand.sensor, store, () => time);
	const readings: TiltReading[] = [];
	source.onReading((reading) => readings.push(reading));
	source.start();
	/** Hold `attitude` for `ms`, a sample every display frame */
	const holdFor = (attitude: Attitude, ms: number) => {
		for (let t = 0; t < ms; t += 16) {
			time += 16;
			hand.hold(attitude);
		}
	};
	/** How far the latest reading is from level */
	const tilt = () => {
		const latest = readings.at(-1);
		if (!latest) throw new Error("no reading");
		return Math.hypot(latest.x, latest.y);
	};
	/** Turn on the spot by `angle` over `ms`, holding `attitude` turned with the player */
	const turnOnTheSpot = (attitude: Attitude, angle: number, ms: number) => {
		for (let t = 16; t <= ms; t += 16) {
			time += 16;
			hand.hold(swivelled(attitude, (angle * t) / ms));
		}
	};
	return { store, hand, source, readings, tilt, holdFor, turnOnTheSpot };
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
		hand.hold(FLAT_ATTITUDES.up);
		expect(readings).toHaveLength(0);
		source.start();
		expect(hand.started).toBe(true);
		hand.hold(FLAT_ATTITUDES.up);
		expect(readings).toHaveLength(1);
		source.stop();
		expect(hand.started).toBe(false);
		expect(hand.listening).toBe(0);
		hand.hold(FLAT_ATTITUDES.up);
		expect(readings).toHaveLength(1);
	});

	it("reads tilt from flat until a level pose is set", () => {
		const { hand, readings } = setup();
		const tipped = attitudeAt({ x: 0.3, y: -0.2 }, FLAT_ATTITUDES.up);
		hand.hold(tipped);
		expect(readings[0].x).toBeCloseTo(0.3);
		expect(readings[0].y).toBeCloseTo(-0.2);
		expect(readings[0]).toMatchObject({ side: "up", attitude: tipped });
	});

	it("reads the saved level pose as level", () => {
		const desk = attitudeAt({ x: 0.5, y: 0.3 }, FLAT_ATTITUDES.up);
		const { hand, tilt } = setup({ levelPoses: { up: gravityOf(desk), down: null } });
		hand.hold(desk);
		expect(tilt()).toBeCloseTo(0);
	});

	it("turned over, reads from the screen-down pose", () => {
		const overhead = attitudeAt({ x: 0.5, y: 0 }, FLAT_ATTITUDES.down);
		const { hand, readings, tilt } = setup({
			levelPoses: { up: { x: 0, y: 0, z: -1 }, down: gravityOf(overhead) },
		});
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
		hand.hold(attitudeAt({ x: 0, y: 125 * DEG }, FLAT_ATTITUDES.up));
		expect(readings.at(-1)?.side).toBe("down");
		hand.hold(attitudeAt({ x: 0, y: 80 * DEG }, FLAT_ATTITUDES.up));
		expect(readings.at(-1)?.side).toBe("down");
		hand.hold(attitudeAt({ x: 0, y: 50 * DEG }, FLAT_ATTITUDES.up));
		expect(readings.at(-1)?.side).toBe("up");
	});

	it("reads the latest attitude again as soon as a pose changes", async () => {
		const { store, hand, readings, tilt } = setup();
		hand.hold(RECLINED);
		expect(tilt()).toBeCloseTo(45 * DEG);
		await calibrateTilt(gravityOf(RECLINED), "up", store, memoryStorage(UNSET));
		expect(readings).toHaveLength(2);
		expect(tilt()).toBeCloseTo(0);
	});

	it("the first sample zeroes the swivel, so a phone held at its level pose reads level whichever way it faces", () => {
		const { hand, tilt } = setup({ levelPoses: { up: gravityOf(UPRIGHT), down: null } });
		hand.hold(swivelled(UPRIGHT, 2));
		expect(tilt()).toBeCloseTo(0);
	});

	it("a swivel reads as tilt until the swivel is zeroed again", () => {
		const { hand, source, tilt } = setup({ levelPoses: { up: gravityOf(UPRIGHT), down: null } });
		hand.hold(UPRIGHT);
		hand.hold(swivelled(UPRIGHT, 0.3));
		expect(tilt()).toBeCloseTo(0.3);
		source.zeroSwivel();
		expect(tilt()).toBeCloseTo(0);
	});

	it("a pose saved later keeps the swivel zeroed last", async () => {
		const { store, hand, source, tilt } = setup({
			levelPoses: { up: gravityOf(UPRIGHT), down: null },
		});
		hand.hold(swivelled(UPRIGHT, 1));
		source.zeroSwivel();
		// The phone moves on before the new pose lands; the zero stays where it was set
		hand.hold(swivelled(UPRIGHT, 1.4));
		await calibrateTilt(gravityOf(RECLINED), "up", store, memoryStorage(UNSET));
		hand.hold(swivelled(RECLINED, 1));
		expect(tilt()).toBeCloseTo(0);
	});

	it("zeroing before any sample reads nothing", () => {
		const { source, readings } = setup();
		source.zeroSwivel();
		expect(readings).toHaveLength(0);
	});

	it("turning on the spot while playing flat keeps forward forward", () => {
		const { readings, holdFor, turnOnTheSpot } = setup();
		holdFor(FLAT_ATTITUDES.up, 100);
		turnOnTheSpot(FLAT_ATTITUDES.up, Math.PI, 1500);
		holdFor(attitudeAt({ x: 0, y: 0.2 }, swivelled(FLAT_ATTITUDES.up, Math.PI)), 16);
		expect(readings.at(-1)?.x).toBeCloseTo(0);
		expect(readings.at(-1)?.y).toBeCloseTo(0.2);
	});

	it("reclined, a turn on the spot reads level again once the player is still", () => {
		const { readings, tilt, holdFor, turnOnTheSpot } = setup({
			levelPoses: { up: gravityOf(RECLINED), down: null },
		});
		holdFor(RECLINED, 100);
		const turned = swivelled(RECLINED, Math.PI / 2);
		turnOnTheSpot(RECLINED, Math.PI / 2, 1000);
		holdFor(turned, 1000);
		expect(tilt()).toBeLessThan(DEG);
		holdFor(attitudeAt({ x: 0.3, y: 0 }, turned), 16);
		expect(readings.at(-1)?.x).toBeCloseTo(0.3, 1);
		expect(readings.at(-1)?.y).toBeCloseTo(0, 1);
	});

	it("upright, a roll held as long as you like keeps its full strength", () => {
		const { readings, holdFor } = setup({ levelPoses: { up: gravityOf(UPRIGHT), down: null } });
		holdFor(UPRIGHT, 100);
		holdFor(swivelled(UPRIGHT, 0.5), 5000);
		expect(readings.at(-1)?.x).toBeCloseTo(0.5);
	});

	it("a pose saved after a turn on the spot keeps the zero the turn dragged", async () => {
		const { store, tilt, holdFor, turnOnTheSpot } = setup({
			levelPoses: { up: gravityOf(UPRIGHT), down: null },
		});
		holdFor(UPRIGHT, 100);
		turnOnTheSpot(UPRIGHT, 2, 1000);
		holdFor(swivelled(UPRIGHT, 2), 1000);
		await calibrateTilt(gravityOf(RECLINED), "up", store, memoryStorage(UNSET));
		holdFor(swivelled(RECLINED, 2), 16);
		expect(tilt()).toBeLessThan(DEG);
	});
});
