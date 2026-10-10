import { type Loop, MusicChannel } from "../../infrastructure/MusicChannel";

function fakeLoop() {
	const loop = {
		loop: false,
		volume: 1,
		playing: false,
		play: vi.fn(() => {
			loop.playing = true;
		}),
		pause: vi.fn(() => {
			loop.playing = false;
		}),
		seekTo: vi.fn(async () => {}),
		remove: vi.fn(),
	};
	return loop;
}

function setup() {
	const menu = fakeLoop();
	const game = fakeLoop();
	const channel = new MusicChannel({
		menu: menu as unknown as Loop,
		game: game as unknown as Loop,
	});
	return { channel, menu, game };
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("MusicChannel", () => {
	it("prepares every track as a silent loop", () => {
		const { menu, game } = setup();
		for (const loop of [menu, game]) {
			expect(loop.loop).toBe(true);
			expect(loop.volume).toBe(0);
			expect(loop.play).not.toHaveBeenCalled();
		}
	});

	it("fades a cued track in from silence to its volume", () => {
		const { channel, menu } = setup();
		channel.setCue({ track: "menu", volume: 0.5 });
		expect(menu.play).toHaveBeenCalledTimes(1);
		expect(menu.volume).toBeGreaterThan(0);
		expect(menu.volume).toBeLessThan(0.5);
		vi.advanceTimersByTime(2000);
		expect(menu.volume).toBe(0.5);
	});

	it("crossfades: the old track fades out, pauses and rewinds; the new one starts", () => {
		const { channel, menu, game } = setup();
		channel.setCue({ track: "menu", volume: 0.5 });
		vi.advanceTimersByTime(2000);
		channel.setCue({ track: "game", volume: 0.6 });
		expect(game.play).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(2000);
		expect(menu.volume).toBe(0);
		expect(menu.pause).toHaveBeenCalledTimes(1);
		expect(menu.seekTo).toHaveBeenCalledWith(0);
		expect(game.volume).toBe(0.6);
	});

	it("ducks in place without pausing or rewinding", () => {
		const { channel, game } = setup();
		channel.setCue({ track: "game", volume: 0.6 });
		vi.advanceTimersByTime(2000);
		channel.setCue({ track: "game", volume: 0.18 });
		vi.advanceTimersByTime(2000);
		expect(game.volume).toBeCloseTo(0.18);
		expect(game.pause).not.toHaveBeenCalled();
		expect(game.seekTo).not.toHaveBeenCalled();
		expect(game.play).toHaveBeenCalledTimes(1);
	});

	it("restarts a track that comes back after fading out", () => {
		const { channel, menu } = setup();
		channel.setCue({ track: "menu", volume: 0.5 });
		vi.advanceTimersByTime(2000);
		channel.setCue({ track: null, volume: 0 });
		vi.advanceTimersByTime(2000);
		channel.setCue({ track: "menu", volume: 0.5 });
		expect(menu.play).toHaveBeenCalledTimes(2);
	});

	it("mutes at once and fades the current cue back in on unmute", () => {
		const { channel, game } = setup();
		channel.setCue({ track: "game", volume: 0.6 });
		vi.advanceTimersByTime(2000);
		channel.setMuted(true);
		expect(game.volume).toBe(0);
		expect(game.pause).toHaveBeenCalledTimes(1);

		channel.setCue({ track: "game", volume: 0.18 });
		vi.advanceTimersByTime(2000);
		expect(game.play).toHaveBeenCalledTimes(1);
		expect(game.volume).toBe(0);

		channel.setMuted(false);
		vi.advanceTimersByTime(2000);
		expect(game.play).toHaveBeenCalledTimes(2);
		expect(game.volume).toBeCloseTo(0.18);
	});

	it("stops its fade timer once settled and on dispose", () => {
		const { channel, menu, game } = setup();
		channel.setCue({ track: "menu", volume: 0.5 });
		vi.advanceTimersByTime(2000);
		expect(vi.getTimerCount()).toBe(0);

		channel.setCue({ track: "game", volume: 0.6 });
		channel.dispose();
		expect(vi.getTimerCount()).toBe(0);
		expect(menu.remove).toHaveBeenCalledTimes(1);
		expect(game.remove).toHaveBeenCalledTimes(1);
		channel.setCue({ track: "menu", volume: 0.5 });
		expect(menu.play).toHaveBeenCalledTimes(1);
	});

	it("clamps cue volumes to 0..1", () => {
		const { channel, menu } = setup();
		channel.setCue({ track: "menu", volume: 3 });
		vi.advanceTimersByTime(3000);
		expect(menu.volume).toBe(1);
	});
});
