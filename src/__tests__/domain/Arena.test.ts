import { arenaContacts, cornerCubics, cornerExtent, holdInside } from "../../domain/arena";
import type { ScreenSize } from "../../domain/types";

const SQUARE: ScreenSize = { width: 400, height: 800 };
/** Circular corners of radius 50: the curve is the arc round (50, 50) in the top-left corner */
const ROUND: ScreenSize = { width: 400, height: 800, corners: { radius: 50, curve: "circular" } };
const CONTINUOUS: ScreenSize = {
	width: 400,
	height: 800,
	corners: { radius: 50, curve: "continuous" },
};

describe("arena", () => {
	describe("corner curve", () => {
		it("reaches the radius along each edge as a circle, about one and a half as iOS's continuous corner", () => {
			expect(cornerExtent(SQUARE)).toBe(0);
			expect(cornerExtent(ROUND)).toBe(50);
			expect(cornerExtent(CONTINUOUS)).toBeCloseTo(76.43, 1);
		});

		it("is square for a radius of 0, and never larger than fits two to an edge", () => {
			expect(cornerExtent({ ...SQUARE, corners: { radius: 0, curve: "continuous" } })).toBe(0);
			expect(cornerCubics({ ...SQUARE, corners: { radius: 0, curve: "continuous" } })).toEqual([]);
			const tiny = {
				width: 100,
				height: 200,
				corners: { radius: 80, curve: "continuous" as const },
			};
			expect(cornerExtent(tiny)).toBeCloseTo(50);
		});

		it("runs from one edge to the other, leaving each along it, without a kink", () => {
			for (const screen of [ROUND, CONTINUOUS]) {
				const cubics = cornerCubics(screen);
				const extent = cornerExtent(screen);
				const [u0, v0, u1, v1] = cubics[0];
				const last = cubics[cubics.length - 1];
				expect([u0, v0]).toEqual([extent, 0]);
				expect(v1).toBe(0);
				expect(u1).toBeLessThan(u0);
				expect(last[6]).toBeCloseTo(0);
				expect(last[7]).toBeCloseTo(extent);
				expect(last[4]).toBeCloseTo(0);
				for (let i = 1; i < cubics.length; i++) {
					expect(cubics[i][0]).toBeCloseTo(cubics[i - 1][6]);
					expect(cubics[i][1]).toBeCloseTo(cubics[i - 1][7]);
				}
			}
		});

		it("passes the diagonal about where a circle of the same radius does, as the continuous corner does", () => {
			// The middle cubic's midpoint is the curve's point on the diagonal
			const [u0, v0, u1, v1, u2, v2, u3, v3] = cornerCubics(CONTINUOUS)[1];
			const u = (u0 + 3 * u1 + 3 * u2 + u3) / 8;
			const v = (v0 + 3 * v1 + 3 * v2 + v3) / 8;
			expect(u).toBeCloseTo(v);
			expect(u).toBeCloseTo(50 * (1 - Math.SQRT1_2), 0);
		});
	});

	describe("contacts", () => {
		it("on a square screen, are the edges within reach: two in a corner", () => {
			expect(arenaContacts(SQUARE, 200, 400, 10)).toEqual([]);
			expect(arenaContacts(SQUARE, 5, 400, 10)).toEqual([{ nx: 1, ny: 0, x: 0, y: 400 }]);
			expect(arenaContacts(SQUARE, 395, 795, 10)).toEqual([
				{ nx: -1, ny: 0, x: 400, y: 795 },
				{ nx: 0, ny: -1, x: 395, y: 800 },
			]);
		});

		it("in a rounded corner, are the curve alone, its normal pointing in where it is nearest", () => {
			const d = 30 * Math.SQRT1_2;
			const [wall, ...rest] = arenaContacts(ROUND, 50 - d, 50 - d, 25);
			expect(rest).toEqual([]);
			expect(wall.nx).toBeCloseTo(Math.SQRT1_2, 2);
			expect(wall.ny).toBeCloseTo(Math.SQRT1_2, 2);
			// The foot on the arc, 50 from its centre
			expect(Math.hypot(wall.x - 50, wall.y - 50)).toBeCloseTo(50, 0);
			expect(arenaContacts(ROUND, 50 - d, 50 - d, 15)).toEqual([]);
		});

		it("mirror into each corner", () => {
			const d = 30 * Math.SQRT1_2;
			const at = (x: number, y: number) => arenaContacts(ROUND, x, y, 25)[0];
			const topRight = at(400 - 50 + d, 50 - d);
			expect([topRight.nx, topRight.ny].map((n) => Math.round(n * 100))).toEqual([-71, 71]);
			const bottomLeft = at(50 - d, 800 - 50 + d);
			expect([bottomLeft.nx, bottomLeft.ny].map((n) => Math.round(n * 100))).toEqual([71, -71]);
			const bottomRight = at(400 - 50 + d, 800 - 50 + d);
			expect([bottomRight.nx, bottomRight.ny].map((n) => Math.round(n * 100))).toEqual([-71, -71]);
		});

		it("include a centre that has overshot the curve, so it is pushed back in", () => {
			const [wall] = arenaContacts(ROUND, 2, 2, 5);
			expect(wall.nx).toBeCloseTo(Math.SQRT1_2, 2);
			expect(wall.ny).toBeCloseTo(Math.SQRT1_2, 2);
		});
	});

	describe("holding a circle inside", () => {
		it("clamps to the edges on a square screen", () => {
			expect(holdInside(SQUARE, -20, 900, 10)).toEqual({ x: 10, y: 790 });
			expect(holdInside(SQUARE, 200, 400, 10)).toEqual({ x: 200, y: 400 });
		});

		it("sits a circle driven into a rounded corner against the curve, not in the square corner", () => {
			const held = holdInside(ROUND, 0, 0, 20);
			// Its centre 50 - 20 from the arc's centre, on the diagonal
			expect(held.x).toBeCloseTo(held.y, 1);
			expect(Math.hypot(held.x - 50, held.y - 50)).toBeCloseTo(30, 0);
		});

		it("slides a circle moving along an edge round the corner instead of stopping it", () => {
			// Moving left along the top wall, into the corner
			const held = holdInside(ROUND, 15, 20, 20);
			expect(held.y).toBeGreaterThan(20);
			expect(held.x).toBeGreaterThan(15);
			expect(Math.hypot(held.x - 50, held.y - 50)).toBeCloseTo(30, 0);
		});
	});
});
