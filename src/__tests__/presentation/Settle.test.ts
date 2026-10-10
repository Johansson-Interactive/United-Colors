import {
	INITIAL_SETTLE,
	SETTLE_HOLD_MS,
	type SettleState,
	STILL_RAD,
	settleEase,
	stepSettle,
} from "../../presentation/tilt/settle";

function run(state: SettleState, x: number, y: number, ms: number, dt = 16): SettleState {
	let s = state;
	for (let t = 0; t < ms; t += dt) s = stepSettle(s, x, y, dt);
	return s;
}

/** A hand: a pose plus a little tremor that alternates sign each frame */
function hold(state: SettleState, x: number, y: number, ms: number, tremor = 0.01): SettleState {
	let s = state;
	let sign = 1;
	for (let t = 0; t < ms; t += 16) {
		s = stepSettle(s, x + tremor * sign, y - tremor * sign, 16);
		sign = -sign;
	}
	return s;
}

describe("settle", () => {
	it("settles on a held pose and reports it as the zero", () => {
		const s = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200);
		expect(s.phase).toBe("settled");
		expect(s.progress).toBe(1);
		expect(s.meanX).toBeCloseTo(0.6, 2);
		expect(s.meanY).toBeCloseTo(-0.2, 2);
	});

	it("does not settle before the hold time", () => {
		const s = run(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS / 2);
		expect(s.phase).toBe("settling");
		expect(s.progress).toBeGreaterThan(0);
		expect(s.progress).toBeLessThan(1);
	});

	it("a moving hand never settles; a hold barely starts at the turning points", () => {
		let s = INITIAL_SETTLE;
		let peak = 0;
		for (let i = 0; i < 200; i++) {
			s = stepSettle(s, Math.sin(i / 3) * 0.3, 0, 16);
			peak = Math.max(peak, s.progress);
		}
		expect(s.phase).not.toBe("settled");
		expect(peak).toBeLessThan(0.25);
	});

	it("moving away part-way through unwinds the hold, then a new hold starts fresh", () => {
		let s = run(INITIAL_SETTLE, 0.5, 0, SETTLE_HOLD_MS / 2);
		const partial = s.progress;
		const moved = 0.5 + STILL_RAD * 3;
		s = run(s, moved, 0, 100);
		expect(s.progress).toBeLessThan(partial);
		// Unwinding takes half the hold time; the new hold then needs the full hold time
		s = run(s, moved, 0, SETTLE_HOLD_MS * 0.75);
		expect(s.phase).toBe("settling");
		s = run(s, moved, 0, SETTLE_HOLD_MS / 2);
		expect(s.phase).toBe("settled");
		expect(s.meanX).toBeCloseTo(moved, 2);
	});

	it("a slow drift adds up against the anchor and breaks the hold", () => {
		let s = INITIAL_SETTLE;
		// 0.15 rad/s: each frame moves far less than STILL_RAD, the whole hold moves more
		for (let i = 0; i < 80; i++) s = stepSettle(s, i * 0.0024, 0, 16);
		expect(s.phase).not.toBe("settled");
	});

	it("tracks the mean to the current pose rather than the first sample", () => {
		let s = run(INITIAL_SETTLE, 0.1, 0.1, 200);
		s = hold(s, 0.7, 0.3, SETTLE_HOLD_MS + 400);
		expect(s.phase).toBe("settled");
		expect(s.meanX).toBeCloseTo(0.7, 2);
		expect(s.meanY).toBeCloseTo(0.3, 2);
	});

	it("stays settled and ignores further samples", () => {
		const s = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200);
		expect(stepSettle(s, 2, 2, 16)).toBe(s);
	});

	it("eases from 0 to 1", () => {
		expect(settleEase(0)).toBe(0);
		expect(settleEase(1)).toBe(1);
		expect(settleEase(0.5)).toBeCloseTo(0.5);
		expect(settleEase(0.25)).toBeLessThan(0.25);
	});
});
