import { attitudeAt, FLAT, FLAT_ATTITUDES, gravityOf } from "../../domain/levelPose";
import type { Attitude, Gravity, PoseSide } from "../../domain/types";
import {
	bowlTilt,
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

const DEG = Math.PI / 180;

/** The phone tipped `x`, `y` from flat, screen up */
function at(x: number, y: number): Attitude {
	return attitudeAt({ x, y }, FLAT_ATTITUDES.up);
}

/** Held upright, facing the player */
const UPRIGHT = at(0, 90 * DEG);

/** Upright, turned about the vertical by `angle`: upright, that is a turn about the long axis */
function swivelledUpright(angle: number): Attitude {
	return attitudeAt({ x: angle, y: 0 }, UPRIGHT);
}

/** The level pose a settle set, as the gravity it saves */
function poseOf(s: SettleState): Gravity | undefined {
	return settleOutcome(s)?.pose;
}

function expectGravity(actual: Gravity | undefined, expected: Gravity): void {
	expect(actual?.x).toBeCloseTo(expected.x, 2);
	expect(actual?.y).toBeCloseTo(expected.y, 2);
	expect(actual?.z).toBeCloseTo(expected.z, 2);
}

function run(state: SettleState, x: number, y: number, ms: number, dt = 16): SettleState {
	let s = state;
	for (let t = 0; t < ms; t += dt) s = stepSettle(s, at(x, y), "up", dt);
	return s;
}

/** A hand: a pose plus a little tremor that alternates sign each frame */
function hold(
	state: SettleState,
	x: number,
	y: number,
	ms: number,
	tremor = 0.01,
	side: PoseSide = "up",
): SettleState {
	let s = state;
	let sign = 1;
	for (let t = 0; t < ms; t += 16) {
		s = stepSettle(s, at(x + tremor * sign, y - tremor * sign), side, 16);
		sign = -sign;
	}
	return s;
}

describe("settle", () => {
	it("settles on a held pose and reports it as the pose", () => {
		const s = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200);
		expect(s.phase).toBe("settled");
		expect(s.progress).toBe(1);
		expectGravity(poseOf(s), gravityOf(at(0.6, -0.2)));
	});

	it("settles held upright or on your side, through a hand's tremor", () => {
		for (const pose of [UPRIGHT, at(90 * DEG, 0)]) {
			let s = INITIAL_SETTLE;
			let sign = 1;
			for (let t = 0; t < SETTLE_HOLD_MS + 200; t += 16) {
				s = stepSettle(s, attitudeAt({ x: 0.01 * sign, y: -0.01 * sign }, pose), "up", 16);
				sign = -sign;
			}
			expect(s.phase).toBe("settled");
			expectGravity(poseOf(s), gravityOf(pose));
		}
	});

	it("upright, a phone still turning about the vertical never fills the hold", () => {
		let s = INITIAL_SETTLE;
		let peak = 0;
		// 0.15 rad/s of swivel: gravity never moves, the phone does
		for (let t = 0; t < SETTLE_HOLD_MS * 2; t += 16) {
			s = stepSettle(s, swivelledUpright((t / 1000) * 0.15), "up", 16);
			peak = Math.max(peak, s.progress);
		}
		expect(s.phase).not.toBe("settled");
		expect(peak).toBeLessThan(0.25);
	});

	it("upright, once the swivel stops the hold fills where the phone came to rest", () => {
		let s = INITIAL_SETTLE;
		for (let t = 0; t < 1000; t += 16)
			s = stepSettle(s, swivelledUpright((t / 1000) * 0.5), "up", 16);
		for (let t = 0; t < SETTLE_HOLD_MS + 200; t += 16)
			s = stepSettle(s, swivelledUpright(0.5), "up", 16);
		expect(s.phase).toBe("settled");
		expectGravity(poseOf(s), gravityOf(UPRIGHT));
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
			s = stepSettle(s, at(Math.sin(i / 3) * 0.3, 0), "up", 16);
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
		expectGravity(poseOf(s), gravityOf(at(moved, 0)));
	});

	it("a slow drift adds up against the anchor and breaks the hold", () => {
		let s = INITIAL_SETTLE;
		// 0.15 rad/s: each frame moves far less than STILL_RAD, the whole hold moves more
		for (let i = 0; i < 80; i++) s = stepSettle(s, at(i * 0.0024, 0), "up", 16);
		expect(s.phase).not.toBe("settled");
	});

	it("tracks the mean to the current pose rather than the first sample", () => {
		let s = run(INITIAL_SETTLE, 0.1, 0.1, 200);
		s = hold(s, 0.7, 0.3, SETTLE_HOLD_MS + 400);
		expect(s.phase).toBe("settled");
		expectGravity(poseOf(s), gravityOf(at(0.7, 0.3)));
	});

	it("stays settled and ignores further samples", () => {
		const s = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200);
		expect(stepSettle(s, FLAT_ATTITUDES.down, "down", 16)).toBe(s);
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
			const s = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200, 0.01, "down");
			const outcome = settleOutcome(s);
			expect(outcome?.side).toBe("down");
			expectGravity(outcome?.pose, gravityOf(at(0.6, -0.2)));
		});

		it("turning over after the dot rests does not change the side", () => {
			const s = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200, 0.01, "up");
			const turned = hold(s, -0.6, 0.2, 500, 0.01, "down");
			expect(settleOutcome(turned)).toEqual(settleOutcome(s));
			expect(settleOutcome(turned)?.side).toBe("up");
		});
	});

	describe("start", () => {
		it("starts the hold when there is a tilt sensor", () => {
			expect(startSettle(WAITING_SETTLE, true)).toEqual(INITIAL_SETTLE);
		});

		it("without a tilt sensor, sets a flat pose screen up straight away", () => {
			const s = startSettle(WAITING_SETTLE, false);
			expectGravity(poseOf(s), FLAT.up);
			expect(settleOutcome(s)?.side).toBe("up");
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
			const s = setSettleNow(hold(INITIAL_SETTLE, 0.5, 0.1, 400, 0.01, "down"), "up");
			expect(s.phase).toBe("settled");
			expect(s.progress).toBe(1);
			const outcome = settleOutcome(s);
			expect(outcome?.side).toBe("down");
			expectGravity(outcome?.pose, gravityOf(at(0.5, 0.1)));
		});

		it("sets a flat pose if no tilt has been measured yet", () => {
			const s = setSettleNow(INITIAL_SETTLE, "down");
			expectGravity(poseOf(s), FLAT.down);
			expect(settleOutcome(s)?.side).toBe("down");
		});

		it("does nothing before the player starts", () => {
			expect(setSettleNow(WAITING_SETTLE, "up")).toBe(WAITING_SETTLE);
		});

		it("settles only once: a tap after settling changes nothing", () => {
			const settled = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200);
			expect(setSettleNow(settled, "down")).toBe(settled);
			const tapped = setSettleNow(run(INITIAL_SETTLE, 0.2, 0, 300), "up");
			expect(setSettleNow(tapped, "down")).toBe(tapped);
			expect(stepSettle(tapped, FLAT_ATTITUDES.down, "down", 16)).toBe(tapped);
		});
	});

	describe("bowl", () => {
		it("before a hold, the dot rolls from flat, to the low edge", () => {
			const tilt = bowlTilt(INITIAL_SETTLE, at(0.3, -0.2));
			expect(tilt.x).toBeCloseTo(0.3);
			expect(tilt.y).toBeCloseTo(-0.2);
		});

		it("turned over, the dot rolls from flat screen down", () => {
			const s = { ...INITIAL_SETTLE, side: "down" as const };
			expect(bowlTilt(s, attitudeAt({ x: 0.3, y: 0 }, FLAT_ATTITUDES.down)).x).toBeCloseTo(0.3);
		});

		it("once the hold has levelled the bowl, the held pose rests in the middle", () => {
			const s = hold(INITIAL_SETTLE, 0.6, -0.2, SETTLE_HOLD_MS + 200, 0);
			const tilt = bowlTilt(s, at(0.6, -0.2));
			expect(tilt.x).toBeCloseTo(0, 3);
			expect(tilt.y).toBeCloseTo(0, 3);
		});

		it("upright, the dot rolls from flat at first and comes to rest as the hold fills", () => {
			let s = INITIAL_SETTLE;
			s = stepSettle(s, UPRIGHT, "up", 16);
			expect(bowlTilt(s, UPRIGHT).y).toBeCloseTo(90 * DEG);
			for (let t = 0; t < SETTLE_HOLD_MS + 200; t += 16) s = stepSettle(s, UPRIGHT, "up", 16);
			const rest = bowlTilt(s, UPRIGHT);
			expect(rest.x).toBeCloseTo(0, 3);
			expect(rest.y).toBeCloseTo(0, 3);
		});

		it("upright, once levelled, a swivel leaves the dot be and the steering wheel rolls it", () => {
			let settled = INITIAL_SETTLE;
			for (let t = 0; t < SETTLE_HOLD_MS + 200; t += 16)
				settled = stepSettle(settled, UPRIGHT, "up", 16);
			expect(bowlTilt(settled, swivelledUpright(0.2)).x).toBeCloseTo(0, 3);
			// The right edge lowered 0.2 before standing the phone up: turned clockwise, as seen
			const wheeled = attitudeAt({ x: 0, y: 90 * DEG }, at(0.2, 0));
			expect(bowlTilt(settled, wheeled).x).toBeCloseTo(0.2, 3);
		});

		it("part-way through a hold, the dot sits between flat and the mean", () => {
			const s = hold(INITIAL_SETTLE, 0.6, 0, SETTLE_HOLD_MS / 2, 0);
			const x = bowlTilt(s, at(0.6, 0)).x;
			expect(x).toBeGreaterThan(0);
			expect(x).toBeLessThan(0.6);
			expect(x).toBeCloseTo(0.6 * (1 - settleEase(s.progress)), 3);
		});
	});

	it("eases from 0 to 1", () => {
		expect(settleEase(0)).toBe(0);
		expect(settleEase(1)).toBe(1);
		expect(settleEase(0.5)).toBeCloseTo(0.5);
		expect(settleEase(0.25)).toBeLessThan(0.25);
	});
});
