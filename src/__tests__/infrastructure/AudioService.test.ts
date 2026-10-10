const players: Array<{
	playing: boolean;
	play: ReturnType<typeof vi.fn>;
	pause: ReturnType<typeof vi.fn>;
	seekTo: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
}> = [];

const audioMock = vi.hoisted(() => ({
	createAudioPlayer: vi.fn(),
	setAudioModeAsync: vi.fn(async () => {}),
}));

vi.mock("expo-audio", () => audioMock);
vi.mock("expo-asset", () => ({
	Asset: {
		loadAsync: vi.fn(async (source: number) => [{ localUri: `file:///sound-${source}.ogg` }]),
	},
}));

import { AudioService } from "../../infrastructure/AudioService";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	players.length = 0;
	audioMock.setAudioModeAsync.mockClear();
	audioMock.createAudioPlayer.mockReset();
	audioMock.createAudioPlayer.mockImplementation(() => {
		const player = {
			playing: false,
			play: vi.fn(),
			pause: vi.fn(),
			seekTo: vi.fn(async () => {}),
			remove: vi.fn(),
		};
		players.push(player);
		return player;
	});
});

const sources = { collect: 1, pointSpawn: 2 };

describe("AudioService", () => {
	it("mixes with other audio and keeps the iOS session active between effects", async () => {
		await new AudioService(sources).load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledWith(
			expect.objectContaining({ interruptionMode: "mixWithOthers", playsInSilentMode: true }),
		);
		expect(audioMock.createAudioPlayer).toHaveBeenCalledWith("file:///sound-1.ogg", {
			keepAudioSessionActive: true,
		});
	});

	it("loads once however often load is called", async () => {
		const audio = new AudioService(sources);
		await Promise.all([audio.load(), audio.load()]);
		await audio.load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledTimes(1);
		expect(players).toHaveLength(6);
	});

	it("plays both effects after an off/on toggle", async () => {
		const audio = new AudioService(sources);
		await audio.load();
		audio.setMuted(true);
		audio.setMuted(false);
		audio.playCollect();
		audio.playPointSpawn();
		await flush();
		const played = players.filter((p) => p.play.mock.calls.length > 0);
		expect(played).toHaveLength(2);
	});

	it("applies a mute set before loading finished", async () => {
		const audio = new AudioService(sources);
		const loading = audio.load();
		audio.setMuted(true);
		await loading;
		audio.playCollect();
		await flush();
		expect(players.every((p) => p.seekTo.mock.calls.length === 0)).toBe(true);
	});

	it("discards a load that was in flight when disposed, and can load again", async () => {
		const audio = new AudioService(sources);
		const first = audio.load();
		audio.dispose();
		await first;
		expect(players).toHaveLength(0);

		await audio.load();
		expect(players).toHaveLength(6);
		audio.dispose();
		expect(players.every((p) => p.remove.mock.calls.length === 1)).toBe(true);
	});

	it("degrades to silence when players cannot be created, and retries on the next load", async () => {
		audioMock.createAudioPlayer.mockImplementationOnce(() => {
			throw new Error("no audio");
		});
		const audio = new AudioService(sources);
		await audio.load();
		expect(() => audio.playCollect()).not.toThrow();

		await audio.load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledTimes(2);
	});
});
