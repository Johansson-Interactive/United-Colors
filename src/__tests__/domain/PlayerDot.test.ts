import { PlayerDot } from "../../domain/entities/PlayerDot";

const STEP_MS = 100;
const SCREEN = { width: 800, height: 600 };
/** The most tilt the dot moves by (radians, 20 degrees); see shapeTilt */
const TOP_TILT = (20 * Math.PI) / 180;

describe("PlayerDot", () => {
	it("starts at given position", () => {
		const player = new PlayerDot(200, 400, "#E91E63", 50, 10);
		expect(player.x).toBe(200);
		expect(player.y).toBe(400);
	});

	it("moves speed px/s per radian of tilt, between the dead zone and the top tilt", () => {
		const player = new PlayerDot(400, 300, "#E91E63", 50, 300);
		player.updateOrientation(0.2, -0.1);
		player.advance(100, SCREEN);
		expect(player.x).toBeCloseTo(406); // 0.2 rad * 300 px/s/rad * 0.1 s
		expect(player.y).toBeCloseTo(297);
	});

	it("rests inside the dead zone", () => {
		const player = new PlayerDot(400, 300, "#E91E63", 50, 300);
		player.updateOrientation(0.01, 0);
		player.advance(1000, SCREEN);
		expect(player.x).toBe(400);
	});

	it("goes no faster past the top tilt, in any direction", () => {
		const player = new PlayerDot(400, 300, "#E91E63", 50, 300);
		player.updateOrientation(1, 1);
		player.advance(100, SCREEN);
		expect(Math.hypot(player.x - 400, player.y - 300)).toBeCloseTo(TOP_TILT * 30);
	});

	it("stands still when flat", () => {
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
		const player = new PlayerDot(30, 300, "#E91E63", 50, 1000);
		player.updateOrientation(-1, 0);
		player.advance(STEP_MS, SCREEN);
		expect(player.x).toBe(25); // halfSize
	});

	it("clamps flush to the right edge", () => {
		const player = new PlayerDot(770, 300, "#E91E63", 50, 1000);
		player.updateOrientation(1, 0);
		player.advance(STEP_MS, SCREEN);
		expect(player.x).toBe(775);
	});

	it("clamps flush to the top edge", () => {
		const player = new PlayerDot(200, 30, "#E91E63", 50, 1000);
		player.updateOrientation(0, -1);
		player.advance(STEP_MS, SCREEN);
		expect(player.y).toBe(25);
	});

	it("clamps flush to the bottom edge", () => {
		const player = new PlayerDot(200, 570, "#E91E63", 50, 1000);
		player.updateOrientation(0, 1);
		player.advance(STEP_MS, SCREEN);
		expect(player.y).toBe(575);
	});

	it("slides along an edge on the free axis", () => {
		const player = new PlayerDot(25, 300, "#E91E63", 50, 100);
		player.updateOrientation(-0.1, 0.1);
		player.advance(STEP_MS, SCREEN);
		expect(player.x).toBe(25);
		expect(player.y).toBeCloseTo(301);
	});

	it("reports the speed a wall holds it back by, signed toward the wall", () => {
		const player = new PlayerDot(30, 300, "#E91E63", 50, 100);
		player.updateOrientation(-0.1, 0);
		player.advance(STEP_MS * 10, SCREEN);
		// Wanted 10 px left in a second; got 5
		expect(player.push.x).toBeCloseTo(-5);
		expect(player.push.y).toBe(0);
		player.advance(STEP_MS, SCREEN);
		expect(player.push.x).toBeCloseTo(-10);
		player.updateOrientation(0, 1);
		player.advance(STEP_MS, SCREEN);
		expect(player.push).toEqual({ x: 0, y: 0 });
		player.updateOrientation(0, 1);
		player.advance(STEP_MS * 1000, SCREEN);
		expect(player.push.x).toBe(0);
		expect(player.push.y).toBeGreaterThan(0);
	});

	it("pushes nothing once told to let go, or with no time elapsed", () => {
		const player = new PlayerDot(25, 300, "#E91E63", 50, 100);
		player.updateOrientation(-1, 0);
		player.advance(STEP_MS, SCREEN);
		expect(player.push.x).toBeLessThan(0);
		player.clearPush();
		expect(player.push).toEqual({ x: 0, y: 0 });
		player.advance(0, SCREEN);
		expect(player.push).toEqual({ x: 0, y: 0 });
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
