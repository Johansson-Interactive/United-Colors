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

import { type AudioHost, AudioService } from "../../infrastructure/AudioService";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A device where nothing else plays, and foreground changes can be sent by the test */
function fakeHost(os = "ios") {
	const state = { otherAudio: false, listener: null as ((foreground: boolean) => void) | null };
	const host: AudioHost = {
		os,
		isOtherAudioPlaying: vi.fn(() => state.otherAudio),
		watchForeground: vi.fn((listener) => {
			state.listener = listener;
			return () => {
				state.listener = null;
			};
		}),
	};
	return { host, state, setForeground: (foreground: boolean) => state.listener?.(foreground) };
}

const host = () => fakeHost().host;

beforeEach(() => {
	players.length = 0;
	audioMock.setAudioModeAsync.mockClear();
	audioMock.createAudioPlayer.mockReset();
	audioMock.createAudioPlayer.mockImplementation(() => {
		const player = {
			playing: false,
			loop: false,
			volume: 1,
			play: vi.fn(() => {
				player.playing = true;
			}),
			pause: vi.fn(() => {
				player.playing = false;
			}),
			shouldCorrectPitch: true,
			setPlaybackRate: vi.fn(),
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
		await new AudioService(sources, music, host()).load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledWith(
			expect.objectContaining({ interruptionMode: "mixWithOthers" }),
		);
		expect(audioMock.createAudioPlayer).toHaveBeenCalledWith("file:///sound-1.ogg", {
			keepAudioSessionActive: true,
		});
	});

	it("follows the silent switch on iOS, as Apple asks of games", async () => {
		await new AudioService(sources, music, fakeHost("ios").host).load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledWith({
			interruptionMode: "mixWithOthers",
			playsInSilentMode: false,
			shouldPlayInBackground: false,
		});
	});

	it("plays through vibrate mode on Android and handles the background itself", async () => {
		await new AudioService(sources, music, fakeHost("android").host).load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledWith({
			interruptionMode: "mixWithOthers",
			playsInSilentMode: true,
			shouldPlayInBackground: true,
		});
	});

	it("plays each effect at its mix level", async () => {
		await new AudioService(sources, music, host()).load();
		const volumes = players.slice(0, EFFECT_PLAYERS).map((p) => p.volume);
		// collect x4, large collect x3, spawn x2, game over x1
		expect(volumes).toEqual([0.95, 0.95, 0.95, 0.95, 0.45, 0.45, 0.45, 0.6, 0.6, 1]);
	});

	it("loads once however often load is called", async () => {
		const audio = new AudioService(sources, music, host());
		await Promise.all([audio.load(), audio.load()]);
		await audio.load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledTimes(1);
		expect(players).toHaveLength(PLAYERS);
	});

	it("plays both effects after an off/on toggle", async () => {
		const audio = new AudioService(sources, music, host());
		await audio.load();
		audio.setEffectsMuted(true);
		audio.setEffectsMuted(false);
		audio.playCollect(0);
		audio.playPointSpawn();
		await flush();
		const played = players.filter((p) => p.play.mock.calls.length > 0);
		expect(played).toHaveLength(2);
	});

	it("applies a mute set before loading finished", async () => {
		const audio = new AudioService(sources, music, host());
		const loading = audio.load();
		audio.setEffectsMuted(true);
		await loading;
		audio.playCollect(0);
		await flush();
		expect(players.every((p) => p.seekTo.mock.calls.length === 0)).toBe(true);
	});

	it("discards a load that was in flight when disposed, and can load again", async () => {
		const audio = new AudioService(sources, music, host());
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
		const audio = new AudioService(sources, music, host());
		await audio.load();
		expect(() => audio.playCollect(0)).not.toThrow();

		await audio.load();
		expect(audioMock.setAudioModeAsync).toHaveBeenCalledTimes(2);
	});

	it("starts the cued music once loaded, looping, and stops it on mute", async () => {
		vi.useFakeTimers();
		try {
			const audio = new AudioService(sources, music, host());
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
		const audio = new AudioService(sources, music, host());
		audio.setMusicMuted(true);
		audio.setMusic({ track: "game", volume: 1 });
		await audio.load();
		expect(players.every((p) => p.play.mock.calls.length === 0)).toBe(true);
	});

	it("mutes effects and music independently", async () => {
		const audio = new AudioService(sources, music, host());
		audio.setMusic({ track: "menu", volume: 0.5 });
		audio.setEffectsMuted(true);
		await audio.load();
		audio.playCollect(0);
		await flush();
		expect(players.slice(0, EFFECT_PLAYERS).every((p) => p.play.mock.calls.length === 0)).toBe(
			true,
		);
		expect(menuLoop()?.play).toHaveBeenCalledTimes(1);

		audio.setEffectsMuted(false);
		audio.setMusicMuted(true);
		audio.playCollect(0);
		await flush();
		expect(players.slice(0, EFFECT_PLAYERS).some((p) => p.play.mock.calls.length > 0)).toBe(true);
		expect(menuLoop()?.pause).toHaveBeenCalled();
	});

	it("plays the game-over stinger as an effect", async () => {
		const audio = new AudioService(sources, music, host());
		await audio.load();
		audio.playGameOver();
		await flush();
		expect(players[EFFECT_PLAYERS - 1]?.play).toHaveBeenCalledTimes(1);
	});

	it("releases music players on dispose and when a music player fails to load", async () => {
		const audio = new AudioService(sources, music, host());
		await audio.load();
		audio.dispose();
		expect(players.every((p) => p.remove.mock.calls.length === 1)).toBe(true);

		players.length = 0;
		const create = audioMock.createAudioPlayer.getMockImplementation();
		audioMock.createAudioPlayer.mockImplementation((...args: unknown[]) => {
			if (players.length === PLAYERS - 1) throw new Error("no audio");
			return create?.(...args);
		});
		await new AudioService(sources, music, host()).load();
		expect(players).toHaveLength(PLAYERS - 1);
		expect(players.every((p) => p.remove.mock.calls.length === 1)).toBe(true);
	});
	describe("with other audio playing", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("leaves the music silent while another app plays, effects still sound", async () => {
			const { host, state } = fakeHost();
			state.otherAudio = true;
			const audio = new AudioService(sources, music, host);
			audio.setMusic({ track: "menu", volume: 1 });
			await audio.load();
			expect(menuLoop()?.play).not.toHaveBeenCalled();

			audio.playCollect(0);
			await vi.advanceTimersByTimeAsync(0);
			expect(players[0]?.play).toHaveBeenCalledTimes(1);
		});

		it("fades the music in once the other app stops", async () => {
			const { host, state } = fakeHost();
			state.otherAudio = true;
			const audio = new AudioService(sources, music, host);
			audio.setMusic({ track: "menu", volume: 1 });
			await audio.load();
			vi.advanceTimersByTime(4000);
			expect(menuLoop()?.play).not.toHaveBeenCalled();

			state.otherAudio = false;
			vi.advanceTimersByTime(2000);
			expect(menuLoop()?.play).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(2000);
			expect(menuLoop()?.volume).toBe(1);
		});

		it("stops looking while the music is switched off", async () => {
			const { host, state } = fakeHost();
			state.otherAudio = true;
			const audio = new AudioService(sources, music, host);
			await audio.load();
			audio.setMusicMuted(true);
			const checks = vi.mocked(host.isOtherAudioPlaying).mock.calls.length;
			vi.advanceTimersByTime(10_000);
			expect(host.isOtherAudioPlaying).toHaveBeenCalledTimes(checks);
		});

		it("only looks while its own music is silent, as Android's check counts it", async () => {
			const { host, state, setForeground } = fakeHost("android");
			const audible: boolean[] = [];
			vi.mocked(host.isOtherAudioPlaying).mockImplementation(() => {
				const loop = menuLoop();
				audible.push(Boolean(loop?.playing && loop.volume > 0));
				return state.otherAudio;
			});
			const audio = new AudioService(sources, music, host);
			audio.setMusic({ track: "menu", volume: 1 });
			await audio.load();
			vi.advanceTimersByTime(2000);
			expect(menuLoop()?.volume).toBe(1);

			setForeground(false);
			state.otherAudio = true;
			setForeground(true);
			state.otherAudio = false;
			vi.advanceTimersByTime(2000);
			// At load, on return, and once more while waiting
			expect(audible).toEqual([false, false, false]);
			expect(menuLoop()?.playing).toBe(true);
		});
	});

	describe("in the background", () => {
		it("silences music and effects, and brings both back on return", async () => {
			vi.useFakeTimers();
			try {
				const { host, setForeground } = fakeHost("android");
				const audio = new AudioService(sources, music, host);
				audio.setMusic({ track: "menu", volume: 1 });
				await audio.load();
				vi.advanceTimersByTime(2000);

				setForeground(false);
				expect(menuLoop()?.pause).toHaveBeenCalled();
				expect(menuLoop()?.volume).toBe(0);
				audio.playCollect(0);
				await vi.advanceTimersByTimeAsync(0);
				expect(players[0]?.play).not.toHaveBeenCalled();

				setForeground(true);
				vi.advanceTimersByTime(2000);
				expect(menuLoop()?.volume).toBe(1);
				audio.playCollect(0);
				await vi.advanceTimersByTimeAsync(0);
				expect(players[0]?.play).toHaveBeenCalledTimes(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it("keeps the music silent on return when the player started other audio meanwhile", async () => {
			vi.useFakeTimers();
			try {
				const { host, state, setForeground } = fakeHost();
				const audio = new AudioService(sources, music, host);
				audio.setMusic({ track: "menu", volume: 1 });
				await audio.load();
				vi.advanceTimersByTime(2000);
				const plays = menuLoop()?.play.mock.calls.length;

				setForeground(false);
				state.otherAudio = true;
				setForeground(true);
				vi.advanceTimersByTime(4000);
				expect(menuLoop()?.play).toHaveBeenCalledTimes(plays ?? 0);
				expect(menuLoop()?.volume).toBe(0);
			} finally {
				vi.useRealTimers();
			}
		});

		it("stops watching the foreground when disposed", async () => {
			const { host, state } = fakeHost();
			const audio = new AudioService(sources, music, host);
			await audio.load();
			expect(state.listener).not.toBeNull();
			audio.dispose();
			expect(state.listener).toBeNull();
		});
	});
});
