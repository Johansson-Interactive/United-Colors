import { resetDotIdCounter } from "../../domain/entities/Dot";
import { PlayerDot } from "../../domain/entities/PlayerDot";

const STEP_MS = 100;
const SCREEN = { width: 800, height: 600 };

describe("PlayerDot", () => {
	beforeEach(() => {
		resetDotIdCounter();
	});

	it("starts at given position", () => {
		const player = new PlayerDot(200, 400, "#E91E63", 50, 10);
		expect(player.x).toBe(200);
		expect(player.y).toBe(400);
	});

	it("moves speed px/s per radian of tilt (linear, legacy)", () => {
		const player = new PlayerDot(400, 300, "#E91E63", 50, 300);
		player.updateOrientation(0.5, -0.2);
		player.advance(100, SCREEN);
		expect(player.x).toBeCloseTo(415); // 0.5 rad * 300 px/s/rad * 0.1 s
		expect(player.y).toBeCloseTo(294);
	});

	it("responds to tiny tilts with no threshold", () => {
		const player = new PlayerDot(400, 300, "#E91E63", 50, 300);
		player.updateOrientation(0.001, 0);
		player.advance(1000, SCREEN);
		expect(player.x).toBeCloseTo(400.3);
	});

	it("stands still only when exactly flat", () => {
		const player = new PlayerDot(400, 300, "#E91E63", 50, 300);
		player.updateOrientation(0, 0);
		player.advance(100, SCREEN);
		expect(player.x).toBe(400);
		expect(player.y).toBe(300);
	});

	it("scales movement with elapsed time (per-frame movement)", () => {
		const a = new PlayerDot(400, 300, "#E91E63", 50, 300);
		const b = new PlayerDot(400, 300, "#E91E63", 50, 300);
		a.updateOrientation(0.4, -0.2);
		b.updateOrientation(0.4, -0.2);
		a.advance(32, SCREEN);
		b.advance(16, SCREEN);
		b.advance(16, SCREEN);
		expect(b.x).toBeCloseTo(a.x);
		expect(b.y).toBeCloseTo(a.y);
	});

	it("clamps flush to the left edge instead of stopping short", () => {
		const player = new PlayerDot(30, 300, "#E91E63", 50, 100);
		player.updateOrientation(-1, 0);
		player.advance(STEP_MS, SCREEN);
		expect(player.x).toBe(25); // halfSize
	});

	it("clamps flush to the right edge", () => {
		const player = new PlayerDot(770, 300, "#E91E63", 50, 100);
		player.updateOrientation(1, 0);
		player.advance(STEP_MS, SCREEN);
		expect(player.x).toBe(775);
	});

	it("clamps flush to the top edge", () => {
		const player = new PlayerDot(200, 30, "#E91E63", 50, 100);
		player.updateOrientation(0, -1);
		player.advance(STEP_MS, SCREEN);
		expect(player.y).toBe(25);
	});

	it("clamps flush to the bottom edge", () => {
		const player = new PlayerDot(200, 570, "#E91E63", 50, 100);
		player.updateOrientation(0, 1);
		player.advance(STEP_MS, SCREEN);
		expect(player.y).toBe(575);
	});

	it("slides along an edge on the free axis", () => {
		const player = new PlayerDot(25, 300, "#E91E63", 50, 100);
		player.updateOrientation(-1, 1);
		player.advance(STEP_MS, SCREEN);
		expect(player.x).toBe(25);
		expect(player.y).toBeCloseTo(310);
	});

	it("applyMovementDelta moves by pixel delta and clamps to bounds", () => {
		const player = new PlayerDot(400, 300, "#E91E63", 50, 10);
		player.applyMovementDelta(20, -10, SCREEN);
		expect(player.x).toBe(420);
		expect(player.y).toBe(290);
		player.applyMovementDelta(-1000, 0, SCREEN);
		expect(player.x).toBe(25); // halfSize = 25, clamped left
		player.applyMovementDelta(0, 1000, SCREEN);
		expect(player.y).toBe(575); // 600 - 25, clamped bottom
	});
});
