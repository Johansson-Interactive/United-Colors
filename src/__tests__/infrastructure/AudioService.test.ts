const players: Array<{
	playing: boolean;
	loop: boolean;
	volume: number;
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
			loop: false,
			volume: 1,
			play: vi.fn(),
			pause: vi.fn(),
			seekTo: vi.fn(async () => {}),
			remove: vi.fn(),
		};
		players.push(player);
		return player;
	});
});

const sources = { collect: 1, collectLarge: 6, pointSpawn: 2, gameOver: 3 };
const music = { menu: 4, game: 5 };
/** 4 collect + 3 large collect + 2 spawn + 1 game-over voices, then one player per music track */
const EFFECT_PLAYERS = 10;
const PLAYERS = EFFECT_PLAYERS + 2;
const menuLoop = () => players[EFFECT_PLAYERS];

describe("AudioService", () => {
	it("mixes with other audio and keeps the iOS session active between effects", async () => {
		await new AudioService(sources, music).load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledWith(
			expect.objectContaining({ interruptionMode: "mixWithOthers", playsInSilentMode: true }),
		);
		expect(audioMock.createAudioPlayer).toHaveBeenCalledWith("file:///sound-1.ogg", {
			keepAudioSessionActive: true,
		});
	});

	it("plays each effect at its mix level", async () => {
		await new AudioService(sources, music).load();
		const volumes = players.slice(0, EFFECT_PLAYERS).map((p) => p.volume);
		// collect x4, large collect x3, spawn x2, game over x1
		expect(volumes).toEqual([1, 1, 1, 1, 0.6, 0.6, 0.6, 0.25, 0.25, 1]);
	});

	it("loads once however often load is called", async () => {
		const audio = new AudioService(sources, music);
		await Promise.all([audio.load(), audio.load()]);
		await audio.load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledTimes(1);
		expect(players).toHaveLength(PLAYERS);
	});

	it("plays both effects after an off/on toggle", async () => {
		const audio = new AudioService(sources, music);
		await audio.load();
		audio.setEffectsMuted(true);
		audio.setEffectsMuted(false);
		audio.playCollect();
		audio.playPointSpawn();
		await flush();
		const played = players.filter((p) => p.play.mock.calls.length > 0);
		expect(played).toHaveLength(2);
	});

	it("applies a mute set before loading finished", async () => {
		const audio = new AudioService(sources, music);
		const loading = audio.load();
		audio.setEffectsMuted(true);
		await loading;
		audio.playCollect();
		await flush();
		expect(players.every((p) => p.seekTo.mock.calls.length === 0)).toBe(true);
	});

	it("discards a load that was in flight when disposed, and can load again", async () => {
		const audio = new AudioService(sources, music);
		const first = audio.load();
		audio.dispose();
		await first;
		expect(players).toHaveLength(0);

		await audio.load();
		expect(players).toHaveLength(PLAYERS);
		audio.dispose();
		expect(players.every((p) => p.remove.mock.calls.length === 1)).toBe(true);
	});

	it("degrades to silence when players cannot be created, and retries on the next load", async () => {
		audioMock.createAudioPlayer.mockImplementationOnce(() => {
			throw new Error("no audio");
		});
		const audio = new AudioService(sources, music);
		await audio.load();
		expect(() => audio.playCollect()).not.toThrow();

		await audio.load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledTimes(2);
	});

	it("starts the cued music once loaded, looping, and stops it on mute", async () => {
		vi.useFakeTimers();
		try {
			const audio = new AudioService(sources, music);
			audio.setMusic({ track: "menu", volume: 0.5 });
			await audio.load();
			const loop = menuLoop();
			expect(loop?.loop).toBe(true);
			expect(loop?.play).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(2000);
			expect(loop?.volume).toBe(0.5);

			audio.setMusicMuted(true);
			expect(loop?.pause).toHaveBeenCalled();
			expect(loop?.volume).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps music silent when muted before loading", async () => {
		const audio = new AudioService(sources, music);
		audio.setMusicMuted(true);
		audio.setMusic({ track: "game", volume: 1 });
		await audio.load();
		expect(players.every((p) => p.play.mock.calls.length === 0)).toBe(true);
	});

	it("mutes effects and music independently", async () => {
		const audio = new AudioService(sources, music);
		audio.setMusic({ track: "menu", volume: 0.5 });
		audio.setEffectsMuted(true);
		await audio.load();
		audio.playCollect();
		await flush();
		expect(players.slice(0, EFFECT_PLAYERS).every((p) => p.play.mock.calls.length === 0)).toBe(
			true,
		);
		expect(menuLoop()?.play).toHaveBeenCalledTimes(1);

		audio.setEffectsMuted(false);
		audio.setMusicMuted(true);
		audio.playCollect();
		await flush();
		expect(players.slice(0, EFFECT_PLAYERS).some((p) => p.play.mock.calls.length > 0)).toBe(true);
		expect(menuLoop()?.pause).toHaveBeenCalled();
	});

	it("plays the game-over stinger as an effect", async () => {
		const audio = new AudioService(sources, music);
		await audio.load();
		audio.playGameOver();
		await flush();
		expect(players[EFFECT_PLAYERS - 1]?.play).toHaveBeenCalledTimes(1);
	});

	it("releases music players on dispose and when a music player fails to load", async () => {
		const audio = new AudioService(sources, music);
		await audio.load();
		audio.dispose();
		expect(players.every((p) => p.remove.mock.calls.length === 1)).toBe(true);

		players.length = 0;
		const create = audioMock.createAudioPlayer.getMockImplementation();
		audioMock.createAudioPlayer.mockImplementation((...args: unknown[]) => {
			if (players.length === PLAYERS - 1) throw new Error("no audio");
			return create?.(...args);
		});
		await new AudioService(sources, music).load();
		expect(players).toHaveLength(PLAYERS - 1);
		expect(players.every((p) => p.remove.mock.calls.length === 1)).toBe(true);
	});
});
