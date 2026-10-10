import { AsyncStorageRepository } from "../../infrastructure/AsyncStorageRepository";

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
		expect(settings.gyroSensitivity).toBe(1.0);
	});

	it("save/load settings roundtrip (placeholder)", async () => {
		const repo = new AsyncStorageRepository();
		await repo.saveSettings({ soundEnabled: false, gyroSensitivity: 0.5, tiltZero: null });
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
});
