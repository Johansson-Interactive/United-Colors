import { createGameStore, type GameStore } from "../../application/GameStore";
import type { GameAudio, MusicCue } from "../../application/ports";
import { bindMusic, MUSIC_CUES } from "../../application/useCases/BindMusic";
import type { GamePhase } from "../../domain/types";

function setPhase(store: GameStore, phase: GamePhase) {
	store.setState((s) => ({ frame: { ...s.frame, phase } }));
}

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

	it("follows a run: game loop, ducked on pause, dipped while refusing, menu after the end", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindMusic(store, audio);
		setPhase(store, "RUNNING");
		setPhase(store, "PAUSED");
		setPhase(store, "RUNNING");
		setPhase(store, "REJECTING");
		setPhase(store, "GAME_OVER");
		setPhase(store, "KIOSK");
		expect(calls).toEqual([
			MUSIC_CUES.KIOSK,
			MUSIC_CUES.RUNNING,
			MUSIC_CUES.PAUSED,
			MUSIC_CUES.RUNNING,
			MUSIC_CUES.REJECTING,
			MUSIC_CUES.GAME_OVER,
			MUSIC_CUES.KIOSK,
		]);
	});

	it("keeps the game loop playing quieter while refusing and quieter still while paused", () => {
		expect(MUSIC_CUES.PAUSED.track).toBe(MUSIC_CUES.RUNNING.track);
		expect(MUSIC_CUES.REJECTING.track).toBe(MUSIC_CUES.RUNNING.track);
		expect(MUSIC_CUES.REJECTING.volume).toBeLessThan(MUSIC_CUES.RUNNING.volume);
		expect(MUSIC_CUES.PAUSED.volume).toBeLessThan(MUSIC_CUES.REJECTING.volume);
	});

	it("plays the menu loop in the kiosk, and lower under the game-over stinger", () => {
		expect(MUSIC_CUES.KIOSK.track).toBe("menu");
		expect(MUSIC_CUES.GAME_OVER.track).toBe("menu");
		expect(MUSIC_CUES.GAME_OVER.volume).toBeLessThan(MUSIC_CUES.KIOSK.volume);
	});

	it("plays the game loop near -17 LUFS, the loops being mastered to -16", () => {
		const db = 20 * Math.log10(MUSIC_CUES.RUNNING.volume);
		expect(-16 + db).toBeCloseTo(-17, 0);
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
		setPhase(store, "RUNNING");
		expect(calls).toHaveLength(1);
	});
});
