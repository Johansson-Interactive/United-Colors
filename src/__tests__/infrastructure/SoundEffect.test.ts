import { SoundEffect, type Voice } from "../../infrastructure/SoundEffect";

/** Seeks resolve when the test says so; play marks the voice as playing */
function fakeVoice() {
	const seeks: Array<() => void> = [];
	const voice = {
		playing: false,
		plays: 0,
		pauses: 0,
		removed: false,
		shouldCorrectPitch: true,
		setPlaybackRate: vi.fn(),
		seekTo: vi.fn(
			() =>
				new Promise<void>((resolve) => {
					seeks.push(resolve);
				}),
		),
		play: vi.fn(() => {
			voice.plays++;
			voice.playing = true;
		}),
		pause: vi.fn(() => {
			voice.pauses++;
			voice.playing = false;
		}),
		remove: vi.fn(() => {
			voice.removed = true;
		}),
	};
	const finishSeeks = async () => {
		for (const resolve of seeks.splice(0)) resolve();
		await flush();
	};
	return { voice, asVoice: voice as unknown as Voice, finishSeeks };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SoundEffect", () => {
	it("rewinds then plays", async () => {
		const a = fakeVoice();
		const effect = new SoundEffect([a.asVoice]);
		effect.play();
		expect(a.voice.seekTo).toHaveBeenCalledWith(0);
		expect(a.voice.plays).toBe(0);
		await a.finishSeeks();
		expect(a.voice.plays).toBe(1);
	});

	it("plays at the pitch asked, in semitones, by speeding the voice up without correcting pitch", async () => {
		const a = fakeVoice();
		const effect = new SoundEffect([a.asVoice]);
		expect(a.voice.shouldCorrectPitch).toBe(false);
		effect.play();
		expect(a.voice.setPlaybackRate).toHaveBeenLastCalledWith(1);
		await a.finishSeeks();
		a.voice.playing = false;
		effect.play(12);
		expect(a.voice.setPlaybackRate).toHaveBeenLastCalledWith(2);
		await a.finishSeeks();
		a.voice.playing = false;
		effect.play(7);
		expect(a.voice.setPlaybackRate.mock.lastCall?.[0]).toBeCloseTo(1.4983);
	});

	it("overlapping plays use separate voices", async () => {
		const a = fakeVoice();
		const b = fakeVoice();
		const effect = new SoundEffect([a.asVoice, b.asVoice]);
		effect.play();
		effect.play();
		await a.finishSeeks();
		await b.finishSeeks();
		expect(a.voice.plays).toBe(1);
		expect(b.voice.plays).toBe(1);
	});

	it("reuses the oldest voice when all are busy", async () => {
		const a = fakeVoice();
		const b = fakeVoice();
		const effect = new SoundEffect([a.asVoice, b.asVoice]);
		effect.play();
		effect.play();
		effect.play();
		await a.finishSeeks();
		await b.finishSeeks();
		expect(a.voice.seekTo).toHaveBeenCalledTimes(2);
		expect(b.voice.seekTo).toHaveBeenCalledTimes(1);
	});

	it("stays silent while muted and plays again after unmuting", async () => {
		const a = fakeVoice();
		const effect = new SoundEffect([a.asVoice]);
		effect.setMuted(true);
		effect.play();
		expect(a.voice.seekTo).not.toHaveBeenCalled();
		effect.setMuted(false);
		effect.play();
		await a.finishSeeks();
		expect(a.voice.plays).toBe(1);
	});

	it("survives repeated off/on toggles", async () => {
		const a = fakeVoice();
		const b = fakeVoice();
		const effect = new SoundEffect([a.asVoice, b.asVoice]);
		for (let i = 0; i < 5; i++) {
			effect.play();
			await a.finishSeeks();
			await b.finishSeeks();
			effect.setMuted(true);
			effect.setMuted(false);
		}
		expect(a.voice.plays + b.voice.plays).toBe(5);
	});

	it("muting stops playing voices and cancels a pending play", async () => {
		const a = fakeVoice();
		const b = fakeVoice();
		const effect = new SoundEffect([a.asVoice, b.asVoice]);
		effect.play();
		await a.finishSeeks();
		effect.play();
		effect.setMuted(true);
		await b.finishSeeks();
		expect(a.voice.pauses).toBe(1);
		expect(a.voice.playing).toBe(false);
		expect(b.voice.plays).toBe(0);
	});

	it("dispose releases every voice and silences later plays", async () => {
		const a = fakeVoice();
		const b = fakeVoice();
		const effect = new SoundEffect([a.asVoice, b.asVoice]);
		effect.dispose();
		effect.play();
		expect(a.voice.removed && b.voice.removed).toBe(true);
		expect(a.voice.seekTo).not.toHaveBeenCalled();
	});

	it("swallows a failed seek and frees the voice", async () => {
		const a = fakeVoice();
		a.voice.seekTo.mockImplementationOnce(() => Promise.reject(new Error("released")));
		const effect = new SoundEffect([a.asVoice]);
		effect.play();
		await flush();
		effect.play();
		await a.finishSeeks();
		expect(a.voice.plays).toBe(1);
	});
});
