import {
	ARMING_MS,
	type GetReadyState,
	HOLD_MS,
	INITIAL_GET_READY,
	isHolding,
	outlineCentre,
	RING_START_RADIUS,
	ringRadius,
	stepGetReady,
} from "../../presentation/tilt/getReady";

function run(state: GetReadyState, x: number, y: number, ms: number, dt = 10): GetReadyState {
	let s = state;
	for (let t = 0; t < ms; t += dt) s = stepGetReady(s, x, y, dt);
	return s;
}

describe("get-ready stepper", () => {
	it("already level at open, fires after the arming delay plus the hold, and not before", () => {
		const almost = run(INITIAL_GET_READY, 0, 0, ARMING_MS + HOLD_MS - 10);
		expect(almost.fired).toBe(false);
		expect(run(almost, 0, 0, 10).fired).toBe(true);
	});

	it("samples inside the arming delay don't count towards the hold", () => {
		const armed = run(INITIAL_GET_READY, 0, 0, ARMING_MS);
		expect(armed.progress).toBe(0);
		expect(run(armed, 0, 0, HOLD_MS - 10).fired).toBe(false);
	});

	it("a frame straddling the end of the arming delay counts only its armed part", () => {
		const s = stepGetReady(run(INITIAL_GET_READY, 0, 0, ARMING_MS - 10), 0, 0, 100);
		expect(s.progress).toBeCloseTo(90 / HOLD_MS, 9);
	});

	it("drifting off level drains the hold faster than it fills", () => {
		const held = run(INITIAL_GET_READY, 0.05, -0.05, ARMING_MS + HOLD_MS / 2);
		expect(held.progress).toBeCloseTo(0.5, 6);
		const drifted = run(held, 0.2, 0, 200);
		expect(drifted.progress).toBeLessThan(0.5 - 200 / HOLD_MS);
		expect(run(drifted, 0, 0.3, 1000).progress).toBe(0);
	});

	it("tilt on either axis alone breaks the hold", () => {
		const held = run(INITIAL_GET_READY, 0, 0, ARMING_MS + HOLD_MS / 2);
		expect(run(held, 0.12, 0, 100).progress).toBeLessThan(held.progress);
		expect(run(held, 0, -0.12, 100).progress).toBeLessThan(held.progress);
	});

	it("fires once only", () => {
		const fired = run(INITIAL_GET_READY, 0, 0, ARMING_MS + HOLD_MS * 2);
		expect(fired.fired).toBe(true);
		expect(stepGetReady(fired, 0, 0, 16)).toBe(fired);
		expect(stepGetReady(fired, 0.5, 0.5, 16)).toBe(fired);
	});
});

describe("get-ready outline", () => {
	const field = { width: 400, height: 800 };
	const dot = { x: 200, y: 400 };
	const radius = 20;

	it("sits on the dot when level", () => {
		expect(outlineCentre(dot, radius, { x: 0, y: 0 }, 1, field)).toEqual(dot);
	});

	it("follows the tilt by the bubble gain times the sensitivity", () => {
		expect(outlineCentre(dot, radius, { x: 0.2, y: -0.1 }, 1, field)).toEqual({ x: 230, y: 385 });
		expect(outlineCentre(dot, radius, { x: 0.2, y: -0.1 }, 1.5, field)).toEqual({
			x: 245,
			y: 377.5,
		});
	});

	it("stays inside the playfield at each wall, sliding along it", () => {
		const far = 2;
		expect(outlineCentre(dot, radius, { x: -far, y: 0.1 }, 1, field)).toEqual({ x: 20, y: 415 });
		expect(outlineCentre(dot, radius, { x: far, y: 0.1 }, 1, field)).toEqual({ x: 380, y: 415 });
		expect(outlineCentre(dot, radius, { x: 0.1, y: -far * 2 }, 1, field)).toEqual({
			x: 215,
			y: 20,
		});
		expect(outlineCentre(dot, radius, { x: 0.1, y: far * 2 }, 1, field)).toEqual({
			x: 215,
			y: 780,
		});
	});

	it("stays inside the playfield in a corner", () => {
		const cornerDot = { x: 25, y: 790 };
		expect(outlineCentre(cornerDot, radius, { x: -0.5, y: 0.5 }, 1, field)).toEqual({
			x: 20,
			y: 780,
		});
	});
});

describe("get-ready ring", () => {
	const dotRadius = 18;

	it("starts at about the old spirit level's inner circle", () => {
		expect(RING_START_RADIUS).toBeCloseTo(40, 0);
		expect(ringRadius(0, dotRadius)).toBe(RING_START_RADIUS);
	});

	it("closes onto the dot at full progress", () => {
		expect(ringRadius(1, dotRadius)).toBe(dotRadius);
	});

	it("contracts monotonically as the hold progresses", () => {
		let previous = Number.POSITIVE_INFINITY;
		for (let p = 0; p <= 1; p += 0.05) {
			const r = ringRadius(p, dotRadius);
			expect(r).toBeLessThan(previous);
			expect(r).toBeGreaterThanOrEqual(dotRadius);
			previous = r;
		}
	});

	it("hugs a dot bigger than the starting ring throughout", () => {
		expect(ringRadius(0.5, RING_START_RADIUS + 10)).toBe(RING_START_RADIUS + 10);
	});
});

describe("get-ready caption", () => {
	const frame = (state: GetReadyState, x: number) => [state, stepGetReady(state, x, 0, 16)] as const;

	it("stays up while the tap's jolt is still arming", () => {
		expect(isHolding(...frame(INITIAL_GET_READY, 0))).toBe(false);
	});

	it("fades while the player holds level", () => {
		const armed = run(INITIAL_GET_READY, 0, 0, ARMING_MS + 100);
		expect(isHolding(...frame(armed, 0))).toBe(true);
	});

	it("comes back when the hold breaks, and stays while off level", () => {
		const held = run(INITIAL_GET_READY, 0, 0, ARMING_MS + HOLD_MS / 2);
		expect(isHolding(...frame(held, 0.3))).toBe(false);
		const drained = run(held, 0.3, 0, 2000);
		expect(isHolding(...frame(drained, 0.3))).toBe(false);
	});
});
