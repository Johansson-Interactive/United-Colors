import {
	HOLD_MS,
	INITIAL_LEVEL_GATE,
	type LevelGateState,
	stepLevelGate,
} from "../../presentation/tilt/levelGate";

const LEAVE = 0.25;

function run(state: LevelGateState, x: number, y: number, ms: number, dt = 16): LevelGateState {
	let s = state;
	for (let t = 0; t < ms; t += dt) s = stepLevelGate(s, x, y, dt, LEAVE);
	return s;
}

describe("level gate", () => {
	it("does not resume when paused while already level", () => {
		const s = run(INITIAL_LEVEL_GATE, 0, 0, HOLD_MS * 3);
		expect(s.phase).toBe("leave");
		expect(s.progress).toBe(0);
		expect(s.fired).toBe(false);
	});

	it("tilting inside the circle does not count as leaving", () => {
		const s = run(INITIAL_LEVEL_GATE, 0.2, 0, 500);
		expect(s.phase).toBe("leave");
	});

	it("leaving the circle then holding level resumes", () => {
		let s = run(INITIAL_LEVEL_GATE, 0.3, 0.1, 50);
		expect(s.phase).toBe("return");
		expect(s.fired).toBe(false);
		s = run(s, 0, 0, HOLD_MS / 2);
		expect(s.fired).toBe(false);
		s = run(s, 0, 0, HOLD_MS);
		expect(s.fired).toBe(true);
	});

	it("stays in the return phase when tilted out again, and progress decays", () => {
		let s = run(INITIAL_LEVEL_GATE, 0, -0.4, 50);
		s = run(s, 0.05, 0.05, HOLD_MS / 2);
		const held = s.progress;
		s = run(s, 0.3, 0, 100);
		expect(s.phase).toBe("return");
		expect(s.progress).toBeLessThan(held);
	});

	it("fires only once", () => {
		let s = run(INITIAL_LEVEL_GATE, 0.5, 0, 16);
		s = run(s, 0, 0, HOLD_MS * 2);
		expect(s.fired).toBe(true);
		expect(stepLevelGate(s, 0, 0, 16, LEAVE)).toBe(s);
	});
});
