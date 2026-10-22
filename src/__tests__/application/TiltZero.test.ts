import { createGameStore } from "../../application/GameStore";
import type { SensorPort, SensorSample, StoragePort } from "../../application/ports";
import { bindTiltZero } from "../../application/useCases/BindTiltZero";
import { calibrateTilt } from "../../application/useCases/CalibrateTilt";
import { loadSettings } from "../../application/useCases/LoadSettings";
import {
	attitudeAt,
	FLAT,
	FLAT_ATTITUDES,
	gravityOf,
	type LevelAttitudes,
	levelWholeTilt,
} from "../../domain/levelPose";
import type { Attitude, GameSettings, Gravity } from "../../domain/types";

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
	const listeners = new Set<(sample: SensorSample) => void>();
	const sensor: SensorPort = {
		start: () => {},
		stop: () => {},
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
		get listening() {
			return listeners.size;
		},
	};
}

const DEG = Math.PI / 180;

/** The phone held in `a`, the player turned about the vertical by `angle` */
function swivelled(a: Attitude, angle: number): Attitude {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return {
		xx: c * a.xx - s * a.xy,
		xy: s * a.xx + c * a.xy,
		xz: a.xz,
		yx: c * a.yx - s * a.yy,
		yy: s * a.yx + c * a.yy,
		yz: a.yz,
		zx: c * a.zx - s * a.zy,
		zy: s * a.zx + c * a.zy,
		zz: a.zz,
	};
}

const UPRIGHT = attitudeAt({ x: 0, y: 90 * DEG }, FLAT_ATTITUDES.up);
const RECLINED = attitudeAt({ x: 0, y: 45 * DEG }, FLAT_ATTITUDES.up);

/** How far the phone held in `attitude` reads from level, from `poses` */
function tiltOf(attitude: Attitude, poses: LevelAttitudes | undefined): number {
	if (!poses) throw new Error("no poses applied");
	const tilt = levelWholeTilt(attitude, poses, "up");
	return Math.hypot(tilt.x, tilt.y);
}

function expectGravity(actual: Gravity, expected: Gravity): void {
	expect(actual.x).toBeCloseTo(expected.x);
	expect(actual.y).toBeCloseTo(expected.y);
	expect(actual.z).toBeCloseTo(expected.z);
}

const UNSET: GameSettings = {
	soundEnabled: true,
	musicEnabled: true,
	tiltSensitivity: 1,
	tiltZero: null,
	tiltZeroDown: null,
};

describe("tilt zero", () => {
	it("calibrateTilt stores the pose and keeps the other settings", async () => {
		const store = createGameStore();
		const storage = memoryStorage({ ...UNSET, soundEnabled: false });
		await loadSettings(store, storage);
		await calibrateTilt({ x: 0.5, y: -0.3, z: -0.8 }, "up", store, storage);
		expect(store.getState().settings).toEqual({
			soundEnabled: false,
			musicEnabled: true,
			tiltSensitivity: 1,
			tiltZero: { x: 0.5, y: -0.3, z: -0.8 },
			tiltZeroDown: null,
		});
	});

	it("a pose set screen down is kept apart from the screen-up one", async () => {
		const store = createGameStore();
		const storage = memoryStorage(UNSET);
		await calibrateTilt({ x: 0.5, y: -0.3, z: -0.8 }, "up", store, storage);
		await calibrateTilt({ x: 0.1, y: 0.2, z: 1 }, "down", store, storage);
		expect(store.getState().settings.tiltZero).toEqual({ x: 0.5, y: -0.3, z: -0.8 });
		expect(store.getState().settings.tiltZeroDown).toEqual({ x: 0.1, y: 0.2, z: 1 });
		const reloaded = createGameStore();
		await loadSettings(reloaded, storage);
		expect(reloaded.getState().settings.tiltZeroDown).toEqual({ x: 0.1, y: 0.2, z: 1 });
	});

	it("the pose survives a reload", async () => {
		const storage = memoryStorage(UNSET);
		await calibrateTilt({ x: 0.5, y: -0.3, z: -0.8 }, "up", createGameStore(), storage);
		const store = createGameStore();
		await loadSettings(store, storage);
		expect(store.getState().settings.tiltZero).toEqual({ x: 0.5, y: -0.3, z: -0.8 });
	});

	it("bindTiltZero applies the saved poses at once, flat until set, and again when they change", async () => {
		const store = createGameStore();
		const { sensor } = handSensor();
		const seen: LevelAttitudes[] = [];
		const binding = bindTiltZero(store, sensor, (poses) => seen.push(poses));
		expect(seen).toHaveLength(1);
		expectGravity(gravityOf(seen[0].up), FLAT.up);
		expectGravity(gravityOf(seen[0].down), FLAT.down);
		await calibrateTilt({ x: 0, y: -1, z: 0 }, "up", store, memoryStorage(UNSET));
		store.getState().updateSettings({ soundEnabled: false });
		await calibrateTilt({ x: 0, y: 1, z: 1 }, "down", store, memoryStorage(UNSET));
		expect(seen).toHaveLength(3);
		expectGravity(gravityOf(seen[1].up), { x: 0, y: -1, z: 0 });
		expectGravity(gravityOf(seen[1].down), FLAT.down);
		expectGravity(gravityOf(seen[2].up), { x: 0, y: -1, z: 0 });
		expectGravity(gravityOf(seen[2].down), { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 });
		binding.unbind();
		await calibrateTilt({ x: 0.5, y: 0.6, z: -1 }, "up", store, memoryStorage(UNSET));
		expect(seen).toHaveLength(3);
	});

	it("the first sample zeroes the swivel, so a phone held at its level pose reads level whichever way it faces", () => {
		const store = createGameStore();
		store.getState().updateSettings({ tiltZero: gravityOf(UPRIGHT) });
		const { sensor, hold } = handSensor();
		let poses: LevelAttitudes | undefined;
		bindTiltZero(store, sensor, (p) => {
			poses = p;
		});
		const facing = swivelled(UPRIGHT, 2);
		hold(facing);
		expect(tiltOf(facing, poses)).toBeCloseTo(0);
	});

	it("a swivel reads as tilt until the swivel is zeroed again", () => {
		const store = createGameStore();
		store.getState().updateSettings({ tiltZero: gravityOf(UPRIGHT) });
		const { sensor, hold } = handSensor();
		let poses: LevelAttitudes | undefined;
		const binding = bindTiltZero(store, sensor, (p) => {
			poses = p;
		});
		hold(UPRIGHT);
		const turned = swivelled(UPRIGHT, 0.3);
		hold(turned);
		expect(tiltOf(turned, poses)).toBeCloseTo(0.3);
		binding.zero();
		expect(tiltOf(turned, poses)).toBeCloseTo(0);
	});

	it("a newly saved pose keeps the swivel zeroed last", async () => {
		const store = createGameStore();
		store.getState().updateSettings({ tiltZero: gravityOf(UPRIGHT) });
		const { sensor, hold } = handSensor();
		let poses: LevelAttitudes | undefined;
		const binding = bindTiltZero(store, sensor, (p) => {
			poses = p;
		});
		hold(swivelled(UPRIGHT, 1));
		binding.zero();
		// The phone moves on before the new pose lands; the zero stays where it was set
		hold(swivelled(UPRIGHT, 1.4));
		await calibrateTilt(gravityOf(RECLINED), "up", store, memoryStorage(UNSET));
		expect(tiltOf(swivelled(RECLINED, 1), poses)).toBeCloseTo(0);
	});

	it("zeroing before any sample keeps the poses as they are, and unbinding stops listening", () => {
		const store = createGameStore();
		const hand = handSensor();
		const seen: LevelAttitudes[] = [];
		const binding = bindTiltZero(store, hand.sensor, (p) => seen.push(p));
		binding.zero();
		expect(seen).toHaveLength(1);
		expect(hand.listening).toBe(1);
		binding.unbind();
		expect(hand.listening).toBe(0);
	});
});
