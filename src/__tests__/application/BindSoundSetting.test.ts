import type { GameAudio } from "../../application/GameAudio";
import { createGameStore } from "../../application/GameStore";
import { bindSoundSetting } from "../../application/useCases/BindSoundSetting";

function fakeAudio() {
	const muted: boolean[] = [];
	const audio: GameAudio = {
		load: async () => {},
		dispose: () => {},
		playCollect: () => {},
		playLargeCollect: () => {},
		playPointSpawn: () => {},
		playGameOver: () => {},
		setMusic: () => {},
		setMuted: (value) => muted.push(value),
	};
	return { audio, muted };
}

describe("bindSoundSetting", () => {
	it("applies the current setting immediately", () => {
		const store = createGameStore();
		store.getState().updateSettings({ soundEnabled: false });
		const { audio, muted } = fakeAudio();
		bindSoundSetting(store, audio);
		expect(muted).toEqual([true]);
	});

	it("follows every off/on toggle", () => {
		const store = createGameStore();
		const { audio, muted } = fakeAudio();
		bindSoundSetting(store, audio);
		store.getState().updateSettings({ soundEnabled: false });
		store.getState().updateSettings({ soundEnabled: true });
		expect(muted).toEqual([false, true, false]);
	});

	it("ignores unrelated store updates", () => {
		const store = createGameStore();
		const { audio, muted } = fakeAudio();
		bindSoundSetting(store, audio);
		store.getState().setHighScore(10);
		store.getState().updateSettings({ gyroSensitivity: 2, tiltZero: null });
		expect(muted).toEqual([false]);
	});

	it("stops following after unsubscribe", () => {
		const store = createGameStore();
		const { audio, muted } = fakeAudio();
		const unbind = bindSoundSetting(store, audio);
		unbind();
		store.getState().updateSettings({ soundEnabled: false });
		expect(muted).toEqual([false]);
	});
});
