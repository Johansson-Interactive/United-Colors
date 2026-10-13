import {
	INITIAL_SETTLE,
	SETTLE_HOLD_MS,
	type SettleState,
	STILL_RAD,
	setSettleNow,
	settleEase,
	settleOutcome,
	startSettle,
	stepSettle,
	WAITING_SETTLE,
} from "../../presentation/tilt/settle";

function run(state: SettleState, x: number, y: number, ms: number, dt = 16): SettleState {
	let s = state;
	for (let t = 0; t < ms; t += dt) s = stepSettle(s, x, y, false, dt);
	return s;
}

/** A hand: a pose plus a little tremor that alternates sign each frame */
function hold(
	state: SettleState,
	x: number,
	y: number,
	ms: number,
	tremor = 0.01,
	facingDown = false,
): SettleState {
	let s = state;
	let sign = 1;
	for (let t = 0; t < ms; t += 16) {
		s = stepSettle(s, x + tremor * sign, y - tremor * sign, facingDown, 16);
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
			s = stepSettle(s, Math.sin(i / 3) * 0.3, 0, false, 16);
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
		for (let i = 0; i < 80; i++) s = stepSettle(s, i * 0.0024, 0, false, 16);
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
		expect(stepSettle(s, 2, 2, true, 16)).toBe(s);
	});

	it("waits for the player to start: holding still before then counts for nothing", () => {
		const s = hold(WAITING_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS * 2);
		expect(s).toBe(WAITING_SETTLE);
	});

	it("once started, a hold settles in the full hold time", () => {
		const s = hold(INITIAL_SETTLE, 0, 0, SETTLE_HOLD_MS - 100);
		expect(s.phase).toBe("settling");
		expect(hold(s, 0, 0, 300).phase).toBe("settled");
	});

	describe("outcome", () => {
		it("has none until settled", () => {
			expect(settleOutcome(WAITING_SETTLE)).toBeNull();
			expect(settleOutcome(hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS / 2))).toBeNull();
		});

		it("takes the pose and the side it was held on together", () => {
			const s = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200, 0.01, true);
			const outcome = settleOutcome(s);
			expect(outcome?.facingDown).toBe(true);
			expect(outcome?.zero.x).toBeCloseTo(0.6, 2);
			expect(outcome?.zero.y).toBeCloseTo(-0.2, 2);
		});

		it("turning over after the dot rests does not change the side", () => {
			const s = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200, 0.01, false);
			const turned = hold(s, -0.6, 0.2, 500, 0.01, true);
			expect(settleOutcome(turned)).toEqual(settleOutcome(s));
			expect(settleOutcome(turned)?.facingDown).toBe(false);
		});
	});

	describe("start", () => {
		it("starts the hold when there is a tilt sensor", () => {
			expect(startSettle(WAITING_SETTLE, true)).toEqual(INITIAL_SETTLE);
		});

		it("without a tilt sensor, sets a flat pose screen up straight away", () => {
			const s = startSettle(WAITING_SETTLE, false);
			expect(settleOutcome(s)).toEqual({ zero: { x: 0, y: 0 }, facingDown: false });
		});

		it("only starts from waiting", () => {
			const running = run(INITIAL_SETTLE, 0.3, 0, 200);
			expect(startSettle(running, true)).toBe(running);
			const settled = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200);
			expect(startSettle(settled, false)).toBe(settled);
		});
	});

	describe("tap to set now", () => {
		it("sets the running mean and the side of the sample it last took", () => {
			const s = setSettleNow(hold(INITIAL_SETTLE, 0.5, 0.1, 400, 0.01, true), false);
			expect(s.phase).toBe("settled");
			expect(s.progress).toBe(1);
			const outcome = settleOutcome(s);
			expect(outcome?.facingDown).toBe(true);
			expect(outcome?.zero.x).toBeCloseTo(0.5, 2);
			expect(outcome?.zero.y).toBeCloseTo(0.1, 2);
		});

		it("sets a flat pose if no tilt has been measured yet", () => {
			expect(settleOutcome(setSettleNow(INITIAL_SETTLE, true))).toEqual({
				zero: { x: 0, y: 0 },
				facingDown: true,
			});
		});

		it("does nothing before the player starts", () => {
			expect(setSettleNow(WAITING_SETTLE, false)).toBe(WAITING_SETTLE);
		});

		it("settles only once: a tap after settling changes nothing", () => {
			const settled = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200);
			expect(setSettleNow(settled, true)).toBe(settled);
			const tapped = setSettleNow(run(INITIAL_SETTLE, 0.2, 0, 300), false);
			expect(setSettleNow(tapped, true)).toBe(tapped);
			expect(stepSettle(tapped, 1, 1, true, 16)).toBe(tapped);
		});
	});

	it("eases from 0 to 1", () => {
		expect(settleEase(0)).toBe(0);
		expect(settleEase(1)).toBe(1);
		expect(settleEase(0.5)).toBeCloseTo(0.5);
		expect(settleEase(0.25)).toBeLessThan(0.25);
	});
});
