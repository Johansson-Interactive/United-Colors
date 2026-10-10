import { tiltFromRotation } from "../../infrastructure/tiltFromRotation";

/** Tilt for a pose reached from the given side, i.e. without the side switching in between */
function up(beta: number, gamma: number) {
	return tiltFromRotation(beta, gamma, false);
}
function down(beta: number, gamma: number) {
	return tiltFromRotation(beta, gamma, true);
}

describe("tiltFromRotation", () => {
	describe("screen up", () => {
		it("flat reads as no tilt", () => {
			const { x, y, facingDown } = up(0, 0);
			expect(x).toBeCloseTo(0);
			expect(y).toBeCloseTo(0);
			expect(facingDown).toBe(false);
		});

		it("matches the raw angles, so saved level poses still hold", () => {
			expect(up(0, 0.4).x).toBeCloseTo(0.4);
			expect(up(0.7, 0).y).toBeCloseTo(0.7);
			expect(up(0.7, -0.3).x).toBeCloseTo(-0.3);
			expect(up(0.7, -0.3).y).toBeCloseTo(0.7, 1);
		});
	});

	describe("screen down", () => {
		it("flat reads as no tilt, from either side of the wrap", () => {
			for (const gamma of [Math.PI, -Math.PI]) {
				const { x, y, facingDown } = down(0, gamma);
				expect(x).toBeCloseTo(0);
				expect(y).toBeCloseTo(0);
				expect(facingDown).toBe(true);
			}
		});

		it("stays steady while the raw angle wraps", () => {
			const a = down(0.2, Math.PI - 0.01);
			const b = down(0.2, -Math.PI + 0.01);
			expect(Math.abs(a.x - b.x)).toBeLessThan(0.03);
			expect(Math.abs(a.y - b.y)).toBeLessThan(0.03);
		});

		it("both axes are mirrored from screen up", () => {
			// Right edge lowered by 0.3 rad, as the player sees the screen
			expect(down(0, Math.PI - 0.3).x).toBeCloseTo(-0.3);
			expect(up(0, 0.3).x).toBeCloseTo(0.3);
			// Top edge lowered by 0.3 rad
			expect(down(-0.3, Math.PI).y).toBeCloseTo(0.3);
			expect(up(-0.3, 0).y).toBeCloseTo(-0.3);
		});
	});

	describe("turning over", () => {
		it("lying screen down switches sides straight away", () => {
			expect(up(0, Math.PI).facingDown).toBe(true);
		});

		it("held near upright, the side doesn't flip back and forth", () => {
			// Upright, leaning 10 degrees either way
			for (const beta of [Math.PI / 2 - 0.17, Math.PI / 2 - 0.01]) {
				expect(up(beta, 0).facingDown).toBe(false);
				expect(up(beta, Math.PI).facingDown).toBe(false);
				expect(down(beta, 0).facingDown).toBe(true);
				expect(down(beta, Math.PI).facingDown).toBe(true);
			}
		});

		it("each side reads smoothly past vertical", () => {
			const before = up(0.3, Math.PI / 2 - 0.001);
			const after = up(0.3, Math.PI / 2 + 0.001);
			expect(Math.abs(before.x - after.x)).toBeLessThan(0.01);
			expect(Math.abs(before.y - after.y)).toBeLessThan(0.01);
		});
	});
});
