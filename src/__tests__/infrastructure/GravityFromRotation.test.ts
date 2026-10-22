import { gravityFromRotation } from "../../infrastructure/gravityFromRotation";

describe("gravityFromRotation", () => {
	it("flat, screen up, gravity goes into the screen", () => {
		const g = gravityFromRotation(0, 0);
		expect(g.x).toBeCloseTo(0);
		expect(g.y).toBeCloseTo(0);
		expect(g.z).toBeCloseTo(-1);
	});

	it("screen down, gravity comes out of the screen, from either side of the wrap", () => {
		for (const gamma of [Math.PI, -Math.PI]) {
			const g = gravityFromRotation(0, gamma);
			expect(g.x).toBeCloseTo(0);
			expect(g.z).toBeCloseTo(1);
		}
	});

	it("leans towards the edge that is lowered", () => {
		// Right edge lowered (gamma), top edge raised (beta)
		expect(gravityFromRotation(0, 0.4).x).toBeCloseTo(Math.sin(0.4));
		expect(gravityFromRotation(0.7, 0).y).toBeCloseTo(-Math.sin(0.7));
	});

	it("upright, gravity points to the bottom edge whatever gamma reads", () => {
		for (const gamma of [0, 1, Math.PI]) {
			const g = gravityFromRotation(Math.PI / 2, gamma);
			expect(g.y).toBeCloseTo(-1);
			expect(Math.hypot(g.x, g.z)).toBeCloseTo(0);
		}
	});
});
