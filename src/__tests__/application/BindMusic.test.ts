import type { GameAudio, MusicCue } from "../../application/GameAudio";
import { createGameStore } from "../../application/GameStore";
import { bindMusic, MUSIC_CUES } from "../../application/useCases/BindMusic";

function fakeAudio() {
	const calls: Array<MusicCue | "gameOver"> = [];
	const audio: GameAudio = {
		load: async () => {},
		dispose: () => {},
		playCollect: () => {},
		playLargeCollect: () => {},
		playPointSpawn: () => {},
		playGameOver: () => calls.push("gameOver"),
		setMusic: (cue) => calls.push(cue),
		setEffectsMuted: () => {},
		setMusicMuted: () => {},
	};
	return { audio, calls };
}

describe("bindMusic", () => {
	it("cues the menu loop for the kiosk straight away", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindMusic(store, audio);
		expect(calls).toEqual([MUSIC_CUES.KIOSK]);
	});

	it("follows a run: game loop, ducked on pause, stinger then menu on game over", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindMusic(store, audio);
		const { setPhase } = store.getState();
		setPhase("RUNNING");
		setPhase("PAUSED");
		setPhase("RUNNING");
		setPhase("GAME_OVER");
		setPhase("KIOSK");
		expect(calls).toEqual([
			MUSIC_CUES.KIOSK,
			MUSIC_CUES.RUNNING,
			MUSIC_CUES.PAUSED,
			MUSIC_CUES.RUNNING,
			"gameOver",
			MUSIC_CUES.GAME_OVER,
			MUSIC_CUES.KIOSK,
		]);
	});

	it("keeps the game loop playing quieter while paused, and the menu calmer than play", () => {
		expect(MUSIC_CUES.PAUSED.track).toBe(MUSIC_CUES.RUNNING.track);
		expect(MUSIC_CUES.PAUSED.volume).toBeLessThan(MUSIC_CUES.RUNNING.volume);
		expect(MUSIC_CUES.KIOSK.track).toBe("menu");
		expect(MUSIC_CUES.KIOSK.volume).toBeLessThan(MUSIC_CUES.RUNNING.volume);
	});

	it("ignores frame updates that keep the phase", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindMusic(store, audio);
		const { updateFrame, frame } = store.getState();
		updateFrame({ ...frame, score: 3 });
		updateFrame({ ...frame, score: 4 });
		expect(calls).toHaveLength(1);
	});

	it("stops following after unsubscribe", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindMusic(store, audio)();
		store.getState().setPhase("RUNNING");
		expect(calls).toHaveLength(1);
	});
});
