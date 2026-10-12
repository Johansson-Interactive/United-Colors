import { DRIP_LAUNCH_TICKS } from "../../domain/constants";
import { dripOffset, dripRadius } from "../../domain/engine/Drip";
import { SmallDot } from "../../domain/entities/SmallDot";

const GROW = 10;
/** A drip on the left wall at (0, 100), heading right and down, growing to 20 px over GROW ticks */
function drip(heading = { vx: Math.SQRT1_2, vy: Math.SQRT1_2 }) {
	return new SmallDot("d", 1, 0, { x: 0, y: 100 }, heading, "#E91E63", 20, 4, GROW);
}

/** Tick the dot as the engine would: remember the start, then update */
function tick(dot: SmallDot, step: number) {
	dot.beginTick();
	dot.update(step);
}

describe("SmallDot", () => {
	describe("forming", () => {
		it("starts as nothing on the wall, not yet drifting", () => {
			const dot = drip();
			expect(dot.size).toBe(0);
			expect(dot).toMatchObject({ x: 0, y: 100, vx: 0, vy: 0, kind: "small" });
			expect(dot.isForming).toBe(true);
			expect(dot.isDrifting).toBe(false);
			expect(dot.contact()).toEqual({
				drip: {
					wall: { nx: 1, ny: 0, x: 0, y: 100 },
					progress: 0,
					prev: 0,
					radius: 10,
					heading: { vx: Math.SQRT1_2, vy: Math.SQRT1_2 },
				},
			});
		});

		it("swells out of the wall along the drip curves, hanging further out as it fills", () => {
			const dot = drip();
			for (let t = 1; t < GROW; t++) {
				tick(dot, t);
				const progress = t / GROW;
				expect(dot.drip).toBeCloseTo(progress);
				expect(dot.prevDrip).toBeCloseTo((t - 1) / GROW);
				expect(dot.size).toBeCloseTo(20 * dripRadius(progress));
				const at = dripOffset(progress, 1, 0, Math.SQRT1_2, Math.SQRT1_2);
				expect(dot.x).toBeCloseTo((at.x * dot.size) / 2);
				expect(dot.y).toBeCloseTo(100 + (at.y * dot.size) / 2);
				expect(dot.isForming).toBe(true);
				expect(dot.contact().drip?.wall).toEqual({ nx: 1, ny: 0, x: 0, y: 100 });
			}
		});

		it("swells forward along its heading from the first bead, its back edge held back", () => {
			const down = drip();
			const up = drip({ vx: Math.SQRT1_2, vy: -Math.SQRT1_2 });
			let front = 100;
			for (let t = 1; t < GROW; t++) {
				tick(down, t);
				tick(up, t);
				const radius = down.size / 2;
				// The front grows away much faster than the back
				expect(down.y + radius - 100).toBeGreaterThan(2 * (100 - (down.y - radius)));
				expect(down.y + radius).toBeGreaterThan(front);
				front = down.y + radius;
				expect(up.y - 100).toBeCloseTo(100 - down.y);
				expect(up.x).toBeCloseTo(down.x);
			}
		});

		it("shoots off along its heading once full, then tears free over DRIP_LAUNCH_TICKS", () => {
			const dot = drip();
			for (let t = 1; t <= GROW; t++) tick(dot, t);
			expect(dot.isForming).toBe(false);
			expect(dot.isDrifting).toBe(true);
			expect(dot.size).toBe(20);
			const at = dripOffset(1, 1, 0, Math.SQRT1_2, Math.SQRT1_2);
			expect(dot.x).toBeCloseTo(at.x * 10);
			expect(dot.y).toBeCloseTo(100 + at.y * 10);
			expect(dot.vx).toBeCloseTo(Math.SQRT1_2);
			expect(dot.vy).toBeCloseTo(Math.SQRT1_2);
			expect(dot.contact()).toEqual({
				// Leaning, it tears from under itself
				launch: { wall: { nx: 1, ny: 0, x: 0, y: dot.y }, progress: 0, prev: 0 },
			});
			const from = { x: dot.x, y: dot.y };
			for (let t = 1; t <= DRIP_LAUNCH_TICKS; t++) {
				tick(dot, GROW + t);
				expect(dot.x).toBeCloseTo(from.x + Math.SQRT1_2 * 4 * t);
				expect(dot.y).toBeCloseTo(from.y + Math.SQRT1_2 * 4 * t);
				expect(dot.launch).toBeCloseTo(t / DRIP_LAUNCH_TICKS);
				expect(dot.prevLaunch).toBeCloseTo((t - 1) / DRIP_LAUNCH_TICKS);
			}
			expect(dot.contact()).toEqual({});
			tick(dot, GROW + DRIP_LAUNCH_TICKS + 1);
			expect(dot.contact()).toEqual({});
		});

		it("a launched drip's foot follows it along the wall, where the fillet tears from", () => {
			const dot = drip();
			for (let t = 1; t <= GROW + 1; t++) tick(dot, t);
			expect(dot.y).toBeGreaterThan(100);
			expect(dot.contact().launch?.wall).toEqual({ nx: 1, ny: 0, x: 0, y: dot.y });
		});

		it("takes at least one tick to form", () => {
			const dot = new SmallDot("d", 1, 0, { x: 0, y: 0 }, { vx: 1, vy: 0 }, "#E91E63", 20, 4, 0);
			tick(dot, 1);
			expect(dot.isForming).toBe(false);
		});

		it("plucked off the wall, it stops growing and merges like any caught dot", () => {
			const dot = drip();
			for (let t = 1; t <= 3; t++) tick(dot, t);
			const size = dot.size;
			dot.startAbsorb();
			expect(dot.isForming).toBe(false);
			tick(dot, 4);
			expect(dot.size).toBe(size);
			expect(dot.absorb).toBeGreaterThan(0);
		});
	});

	describe("at a wall", () => {
		/** A full-grown dot drifting at (100, 100), 20 px across, moving 4 px per tick */
		function drifting(vx: number, vy: number) {
			const dot = new SmallDot("d", 1, 0, { x: 0, y: 100 }, { vx, vy }, "#E91E63", 20, 4, 1);
			for (let t = 1; t <= 1 + DRIP_LAUNCH_TICKS; t++) tick(dot, t);
			dot.x = 100;
			dot.y = 100;
			return dot;
		}

		it("is set flush against the wall it reaches and heads straight back in", () => {
			const dot = drifting(-0.6, 0.8);
			dot.x = 8; // 2 px into the left wall
			dot.bounce(1, 0, { x: 0, y: dot.y });
			expect(dot.x).toBe(10);
			expect(dot.isDrifting).toBe(true);
			expect(dot.vx).toBeCloseTo(0.6);
			expect(dot.vy).toBeCloseTo(0.8);
			expect(dot.contact()).toEqual({});
			tick(dot, 11);
			expect(dot.x).toBeCloseTo(10 + 0.6 * 4);
			expect(dot.y).toBeCloseTo(100 + 0.8 * 4);
		});

		it("sets the inward sign of its heading rather than flipping it", () => {
			// Already heading away from the wall when it is found past it
			const dot = drifting(0.6, 0.8);
			dot.x = 8;
			dot.bounce(1, 0, { x: 0, y: dot.y });
			expect(dot.x).toBe(10);
			expect(dot.vx).toBeCloseTo(0.6);
		});

		it("bounces out of a corner off both walls", () => {
			const dot = drifting(-0.6, -0.8);
			dot.x = 8;
			dot.y = 9;
			dot.bounce(1, 0, { x: 0, y: dot.y });
			dot.bounce(0, 1, { x: dot.x, y: 0 });
			expect(dot).toMatchObject({ x: 10, y: 10 });
			expect(dot.vx).toBeCloseTo(0.6);
			expect(dot.vy).toBeCloseTo(0.8);
		});
	});
});
