import {
	createJelly,
	JELLY_AT_REST,
	JELLY_MAX_STRETCH,
	JELLY_WOBBLE_PERIOD_S,
	jellyShape,
	kickJelly,
	stepJelly,
} from "../../application/jelly";

const FRAME_MS = 1000 / 60;
const RADIUS = 25;

/** Run `frames` frames moving the player by (vx, vy) px per frame from (x, y) */
function run(
	step: ReturnType<typeof createJelly>,
	frames: number,
	start: { x: number; y: number },
	vx: number,
	vy: number,
) {
	let shape = step(start.x, start.y, RADIUS, FRAME_MS);
	for (let i = 1; i <= frames; i++) {
		shape = step(start.x + vx * i, start.y + vy * i, RADIUS, FRAME_MS);
	}
	return { ...shape };
}

describe("jelly", () => {
	it("is round at rest", () => {
		const step = createJelly();
		const shape = run(step, 30, { x: 100, y: 100 }, 0, 0);
		expect(shape.stretchX).toBe(0);
		expect(shape.stretchY).toBe(0);
	});

	it("draws out along the motion while moving, within the max stretch", () => {
		const step = createJelly();
		const shape = run(step, 60, { x: 100, y: 100 }, 12, 0);
		expect(Math.abs(shape.stretchX)).toBeGreaterThan(0.05);
		expect(Math.abs(shape.stretchX)).toBeLessThanOrEqual(JELLY_MAX_STRETCH);
		expect(Math.abs(shape.stretchY)).toBeLessThan(1e-9);
	});

	it("sloshes past round after a sudden stop, then settles", () => {
		const step = createJelly();
		const moving = run(step, 60, { x: 100, y: 100 }, 12, 0);
		// Stop dead and watch the stretch swing to the other side
		const stopX = 100 + 12 * 60;
		const after: number[] = [];
		for (let i = 0; i < 240; i++) after.push(step(stopX, 100, RADIUS, FRAME_MS).stretchX);
		expect(Math.min(...after.map((s) => s * Math.sign(moving.stretchX)))).toBeLessThan(-0.02);
		expect(Math.abs(after[after.length - 1])).toBeLessThan(0.002);
	});

	it("resets instead of sloshing when the player respawns far away", () => {
		const step = createJelly();
		run(step, 60, { x: 100, y: 100 }, 12, 0);
		const shape = step(5000, 5000, RADIUS, FRAME_MS);
		expect(shape.stretchX).toBe(0);
		expect(shape.stretchY).toBe(0);
	});

	it("holds its shape and wobble clock on a redraw with no elapsed time", () => {
		const step = createJelly();
		const moving = run(step, 20, { x: 100, y: 100 }, 12, 0);
		const redraw = step(100 + 12 * 20, 100, RADIUS, 0);
		expect(redraw).toEqual(moving);
	});

	it("runs the wobble clock in seconds and wraps it at the period", () => {
		const step = createJelly();
		step(0, 0, RADIUS, 0);
		expect(step(0, 0, RADIUS, 500).wobble).toBeCloseTo(0.5);
		expect(step(0, 0, RADIUS, JELLY_WOBBLE_PERIOD_S * 1000).wobble).toBeCloseTo(0.5);
	});

	it("steps as a pure function too, for a drop driven from the UI thread", () => {
		const step = createJelly();
		let body = JELLY_AT_REST;
		for (let i = 0; i <= 20; i++) {
			const before = { ...body };
			const next = stepJelly(body, 100 + 12 * i, 100, RADIUS, FRAME_MS);
			expect(body).toEqual(before);
			body = next;
			expect(jellyShape(body, RADIUS)).toEqual(step(100 + 12 * i, 100, RADIUS, FRAME_MS));
		}
	});

	it("sloshes along a kick, as from a catch landing on a still drop, then settles", () => {
		let body = stepJelly(JELLY_AT_REST, 100, 100, RADIUS, FRAME_MS);
		const before = { ...body };
		const kicked = kickJelly(body, 0, 20 * RADIUS);
		expect(body).toEqual(before);
		body = kicked;
		const stretches: number[] = [];
		for (let i = 0; i < 240; i++) {
			body = stepJelly(body, 100, 100, RADIUS, FRAME_MS);
			const shape = jellyShape(body, RADIUS);
			expect(Math.abs(shape.stretchX)).toBeLessThan(1e-9);
			expect(Math.abs(shape.stretchY)).toBeLessThanOrEqual(JELLY_MAX_STRETCH);
			stretches.push(shape.stretchY);
		}
		expect(Math.max(...stretches)).toBeGreaterThan(0.05);
		expect(Math.min(...stretches)).toBeLessThan(-0.01);
		expect(Math.abs(stretches[stretches.length - 1])).toBeLessThan(0.002);
	});

	it("sloshes along a slanted kick, drawn out the way it was knocked", () => {
		let body = stepJelly(JELLY_AT_REST, 100, 100, RADIUS, FRAME_MS);
		body = kickJelly(body, -12 * RADIUS, 16 * RADIUS);
		for (let i = 0; i < 3; i++) body = stepJelly(body, 100, 100, RADIUS, FRAME_MS);
		const { stretchX, stretchY } = jellyShape(body, RADIUS);
		expect(stretchX).toBeLessThan(0);
		expect(stretchX / stretchY).toBeCloseTo(-12 / 16);
	});
});
