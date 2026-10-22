import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	DEFAULT_SETTINGS,
	TILT_SENSITIVITY_MAX,
	TILT_SENSITIVITY_MIN,
} from "../../domain/constants";
import type { GameSettings } from "../../domain/types";
import { AsyncStorageRepository } from "../../infrastructure/AsyncStorageRepository";

vi.mock("@react-native-async-storage/async-storage", () => {
	const items = new Map<string, string>();
	return {
		default: {
			getItem: async (key: string) => items.get(key) ?? null,
			setItem: async (key: string, value: string) => {
				items.set(key, value);
			},
			clear: async () => items.clear(),
		},
	};
});

const SETTINGS_KEY = "@tiltling/settings";

/** Persist a raw value as an older or hand-edited app might have, then load it */
async function loadStored(raw: unknown): Promise<GameSettings> {
	await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(raw));
	return new AsyncStorageRepository().loadSettings();
}

beforeEach(() => AsyncStorage.clear());

describe("Persistence roundtrip", () => {
	it("loads default high score of 0", async () => {
		const repo = new AsyncStorageRepository();
		const score = await repo.loadHighScore();
		expect(score).toBe(0);
	});

	it("loads default settings", async () => {
		const repo = new AsyncStorageRepository();
		const settings = await repo.loadSettings();
		expect(settings).toEqual(DEFAULT_SETTINGS);
	});

	it("save/load settings roundtrip", async () => {
		const repo = new AsyncStorageRepository();
		const saved: GameSettings = {
			soundEnabled: false,
			musicEnabled: true,
			tiltSensitivity: 1,
			levelPoses: { up: { x: 0.6, y: 0, z: -0.8 }, down: null },
		};
		await repo.saveSettings(saved);
		expect(await repo.loadSettings()).toEqual(saved);
	});

	it("save/load high score roundtrip", async () => {
		const repo = new AsyncStorageRepository();
		await repo.saveHighScore(42);
		expect(await repo.loadHighScore()).toBe(42);
	});

	it("keeps music off for settings saved before music had its own switch", async () => {
		const settings = await loadStored({ soundEnabled: false, gyroSensitivity: 1, tiltZero: null });
		expect(settings.soundEnabled).toBe(false);
		expect(settings.musicEnabled).toBe(false);
	});

	it("keeps music and effects apart once both are saved", async () => {
		const repo = new AsyncStorageRepository();
		await repo.saveSettings({
			soundEnabled: false,
			musicEnabled: true,
			tiltSensitivity: 1,
			levelPoses: { up: null, down: null },
		});
		const settings = await repo.loadSettings();
		expect(settings.soundEnabled).toBe(false);
		expect(settings.musicEnabled).toBe(true);
	});
});

describe("Persisted settings are validated before use", () => {
	/** Settings stored with these level poses */
	const withPoses = (up: unknown, down: unknown) => ({
		...DEFAULT_SETTINGS,
		levelPoses: { up, down },
	});

	it("drops a level pose that is not a pose", async () => {
		const settings = await loadStored(withPoses("0.5,0.3", null));
		expect(settings.levelPoses.up).toBeNull();
		const unshaped = await loadStored({ ...DEFAULT_SETTINGS, levelPoses: "up" });
		expect(unshaped.levelPoses).toEqual({ up: null, down: null });
	});

	it("drops a level pose with a non-finite coordinate", async () => {
		// JSON has no NaN; a hand-edited or buggy writer leaves null, a string or Infinity-as-null
		const settings = await loadStored(
			withPoses({ x: null, y: 0.3, z: -1 }, { x: 0.1, y: 0.2, z: "NaN" }),
		);
		expect(settings.levelPoses).toEqual({ up: null, down: null });
	});

	it("drops a level pose missing a coordinate or of no length, and keeps the other pose", async () => {
		const settings = await loadStored(withPoses({ x: 0.5 }, { x: 0, y: 0.6, z: 0.8 }));
		expect(settings.levelPoses).toEqual({ up: null, down: { x: 0, y: 0.6, z: 0.8 } });
		const empty = await loadStored(withPoses({ x: 0, y: 0, z: 0 }, null));
		expect(empty.levelPoses.up).toBeNull();
	});

	it("reads a pose back at unit length", async () => {
		const settings = await loadStored(withPoses({ x: 0, y: -3, z: -4 }, null));
		expect(settings.levelPoses.up).toEqual({ x: 0, y: -0.6, z: -0.8 });
	});

	it("reads the poses as builds saved them before they were kept together", async () => {
		const { levelPoses: _, ...rest } = DEFAULT_SETTINGS;
		const settings = await loadStored({
			...rest,
			tiltZero: { x: 0, y: -3, z: -4 },
			tiltZeroDown: { x: 0, y: 0.6, z: 0.8 },
		});
		expect(settings.levelPoses).toEqual({
			up: { x: 0, y: -0.6, z: -0.8 },
			down: { x: 0, y: 0.6, z: 0.8 },
		});
	});

	it("drops a pose saved as two angles, as poses were before they were gravity", async () => {
		const { levelPoses: _, ...rest } = DEFAULT_SETTINGS;
		const settings = await loadStored({
			...rest,
			tiltZero: { x: 0.25, y: -0.5 },
			tiltZeroDown: { x: 0.1, y: 0.2 },
		});
		expect(settings.levelPoses).toEqual({ up: null, down: null });
	});

	it("drops unknown keys instead of carrying them into the settings", async () => {
		const settings = await loadStored({ ...DEFAULT_SETTINGS, gyroSensitivity: 1.5, theme: "dark" });
		expect(settings.tiltSensitivity).toBe(DEFAULT_SETTINGS.tiltSensitivity);
		expect(settings).toEqual(DEFAULT_SETTINGS);
		expect(Object.keys(settings).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
	});

	it("keeps a tilt sensitivity within range and defaults one that is not", async () => {
		expect((await loadStored({ ...DEFAULT_SETTINGS, tiltSensitivity: 1.5 })).tiltSensitivity).toBe(
			1.5,
		);
		expect(
			(await loadStored({ ...DEFAULT_SETTINGS, tiltSensitivity: TILT_SENSITIVITY_MIN }))
				.tiltSensitivity,
		).toBe(TILT_SENSITIVITY_MIN);
		for (const bad of [0, -1, TILT_SENSITIVITY_MAX * 2, "fast", null, Number.NaN]) {
			expect(
				(await loadStored({ ...DEFAULT_SETTINGS, tiltSensitivity: bad })).tiltSensitivity,
			).toBe(1);
		}
		expect((await loadStored({ soundEnabled: true })).tiltSensitivity).toBe(1);
	});

	it("falls back to the default for a switch that is not a boolean", async () => {
		const settings = await loadStored({ soundEnabled: "yes", musicEnabled: 0 });
		expect(settings.soundEnabled).toBe(true);
		expect(settings.musicEnabled).toBe(true);
	});

	it("falls back to defaults when the stored value is not an object", async () => {
		expect(await loadStored([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
		expect(await loadStored("settings")).toEqual(DEFAULT_SETTINGS);
		expect(await loadStored(null)).toEqual(DEFAULT_SETTINGS);
	});

	it("falls back to defaults when the stored value is not JSON", async () => {
		await AsyncStorage.setItem(SETTINGS_KEY, "{not json");
		expect(await new AsyncStorageRepository().loadSettings()).toEqual(DEFAULT_SETTINGS);
	});
});
