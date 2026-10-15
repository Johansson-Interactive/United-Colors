import { benchSessionOptions, benchTilt } from "../../application/bench";
import { GameSession } from "../../application/GameSession";
import { createGameStore } from "../../application/GameStore";
import type { Clock } from "../../application/ports";

/** A clock the test steps by hand: each step is one tick and one rendered frame */
function manualClock() {
	let tick: () => void = () => {};
	let frame: (dtMs: number, alpha: number) => void = () => {};
	const clock: Clock = { start: () => {}, stop: () => {} };
	return {
		createClock: (onTick: () => void, onFrame?: (dtMs: number, alpha: number) => void) => {
			tick = onTick;
			frame = onFrame ?? (() => {});
			return clock;
		},
		step: () => {
			tick();
			frame(1000 / 30, 0);
		},
	};
}

function benchRun(seconds: number) {
	const store = createGameStore();
	const clock = manualClock();
	const session = new GameSession({
		store,
		createClock: clock.createClock,
		...benchSessionOptions(),
	});
	session.setScreen({ width: 400, height: 800 });
	session.start("#E91E63");
	const frames = [];
	for (let t = 0; t < seconds * 30; t++) {
		session.feedTilt(benchTilt(t / 30));
		clock.step();
		frames.push(store.getState().frame);
	}
	return frames;
}

describe("bench run", () => {
	it("keeps playing with a full screen of dots", () => {
		const frames = benchRun(60);
		const last = frames[frames.length - 1];
		expect(last.phase).toBe("RUNNING");
		expect(last.dots.length).toBeGreaterThan(30);
	});

	it("plays the same run every time", () => {
		const a = benchRun(20).map((f) => [f.score, f.dots.length]);
		const b = benchRun(20).map((f) => [f.score, f.dots.length]);
		expect(b).toEqual(a);
	});

	it("steers the player round the screen, both ways on both axes", () => {
		const samples = Array.from({ length: 300 }, (_, i) => benchTilt(i / 10));
		expect(Math.min(...samples.map((s) => s.x))).toBeLessThan(-0.1);
		expect(Math.max(...samples.map((s) => s.x))).toBeGreaterThan(0.1);
		expect(Math.min(...samples.map((s) => s.y))).toBeLessThan(-0.1);
		expect(Math.max(...samples.map((s) => s.y))).toBeGreaterThan(0.1);
	});
});
