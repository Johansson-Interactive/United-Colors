import AsyncStorage from "@react-native-async-storage/async-storage";
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
		expect(settings.soundEnabled).toBe(true);
		expect(settings.musicEnabled).toBe(true);
	});

	it("save/load settings roundtrip (placeholder)", async () => {
		const repo = new AsyncStorageRepository();
		await repo.saveSettings({
			soundEnabled: false,
			musicEnabled: true,
			tiltZero: null,
			tiltZeroDown: null,
		});
		// Currently returns defaults since AsyncStorage is not wired
		const settings = await repo.loadSettings();
		expect(settings).toBeDefined();
	});

	it("save/load high score roundtrip (placeholder)", async () => {
		const repo = new AsyncStorageRepository();
		await repo.saveHighScore(42);
		// Currently returns 0 since AsyncStorage is not wired
		const score = await repo.loadHighScore();
		expect(score).toBeDefined();
	});

	it("keeps music off for settings saved before music had its own switch", async () => {
		await AsyncStorage.setItem(
			"@united_colors/settings",
			JSON.stringify({ soundEnabled: false, gyroSensitivity: 1, tiltZero: null }),
		);
		const settings = await new AsyncStorageRepository().loadSettings();
		expect(settings.soundEnabled).toBe(false);
		expect(settings.musicEnabled).toBe(false);
	});

	it("keeps music and effects apart once both are saved", async () => {
		const repo = new AsyncStorageRepository();
		await repo.saveSettings({
			soundEnabled: false,
			musicEnabled: true,
			tiltZero: null,
			tiltZeroDown: null,
		});
		const settings = await repo.loadSettings();
		expect(settings.soundEnabled).toBe(false);
		expect(settings.musicEnabled).toBe(true);
	});
});
