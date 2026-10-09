import { circlesOverlap, didCollide } from "../../domain/engine/Collision";
import { Dot, resetDotIdCounter } from "../../domain/entities/Dot";

describe("Collision", () => {
	beforeEach(() => {
		resetDotIdCounter();
	});

	it("detects collision when dots overlap", () => {
		const a = new Dot(100, 100, 0, 0, "#E91E63", 50, 0);
		const b = new Dot(120, 100, 0, 0, "#2196F3", 50, 0);
		expect(didCollide(a, b)).toBe(true);
	});

	it("detects collision when dots are touching exactly", () => {
		// Size = 50 each, so combined radius = 50/2 = 25 per dot, 50 total
		// Distance = 50 => exactly touching
		const a = new Dot(0, 0, 0, 0, "#E91E63", 50, 0);
		const b = new Dot(50, 0, 0, 0, "#2196F3", 50, 0);
		expect(didCollide(a, b)).toBe(true);
	});

	it("does not detect collision when dots are far apart", () => {
		const a = new Dot(0, 0, 0, 0, "#E91E63", 50, 0);
		const b = new Dot(200, 200, 0, 0, "#2196F3", 50, 0);
		expect(didCollide(a, b)).toBe(false);
	});

	it("does not detect collision when dots are barely not touching", () => {
		const a = new Dot(0, 0, 0, 0, "#E91E63", 50, 0);
		const b = new Dot(51, 0, 0, 0, "#2196F3", 50, 0);
		expect(didCollide(a, b)).toBe(false);
	});

	it("handles zero-size dots", () => {
		const a = new Dot(10, 10, 0, 0, "#E91E63", 0, 0);
		const b = new Dot(10, 10, 0, 0, "#2196F3", 0, 0);
		expect(didCollide(a, b)).toBe(true);
	});

	it("circlesOverlap matches didCollide from raw centers and sizes", () => {
		expect(circlesOverlap(100, 100, 50, 150, 100, 50)).toBe(true); // touching
		expect(circlesOverlap(100, 100, 50, 151, 100, 50)).toBe(false);
	});
});
