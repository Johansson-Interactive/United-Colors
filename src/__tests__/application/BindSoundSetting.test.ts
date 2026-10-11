import type { GameAudio } from "../../application/GameAudio";
import { createGameStore } from "../../application/GameStore";
import { bindSoundSetting } from "../../application/useCases/BindSoundSetting";

function fakeAudio() {
	const calls: string[] = [];
	const audio: GameAudio = {
		load: async () => {},
		dispose: () => {},
		playCollect: () => {},
		playLargeCollect: () => {},
		playPointSpawn: () => {},
		playGameOver: () => {},
		setMusic: () => {},
		setEffectsMuted: (muted) => calls.push(`effects:${muted}`),
		setMusicMuted: (muted) => calls.push(`music:${muted}`),
	};
	return { audio, calls };
}

describe("bindSoundSetting", () => {
	it("applies the current settings immediately", () => {
		const store = createGameStore();
		store.getState().updateSettings({ soundEnabled: false });
		const { audio, calls } = fakeAudio();
		bindSoundSetting(store, audio);
		expect(calls).toEqual(["effects:true", "music:false"]);
	});

	it("follows each switch on its own", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindSoundSetting(store, audio);
		calls.length = 0;
		store.getState().updateSettings({ soundEnabled: false });
		store.getState().updateSettings({ musicEnabled: false });
		store.getState().updateSettings({ soundEnabled: true });
		expect(calls).toEqual(["effects:true", "music:true", "effects:false"]);
	});

	it("ignores unrelated store updates", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		bindSoundSetting(store, audio);
		calls.length = 0;
		store.getState().setHighScore(10);
		store.getState().updateSettings({ tiltZero: null });
		expect(calls).toEqual([]);
	});

	it("stops following after unsubscribe", () => {
		const store = createGameStore();
		const { audio, calls } = fakeAudio();
		const unbind = bindSoundSetting(store, audio);
		unbind();
		calls.length = 0;
		store.getState().updateSettings({ soundEnabled: false, musicEnabled: false });
		expect(calls).toEqual([]);
	});
});
