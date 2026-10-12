import { DRIP_HANG_MAX, DRIP_HANG_MIN, DRIP_LEAN } from "../../domain/constants";
import { dripHang, dripOffset, dripRadius } from "../../domain/engine/Drip";

describe("drip curves", () => {
	it("the radius grows from nothing to full, its area filling at a steady flow", () => {
		expect(dripRadius(0)).toBe(0);
		expect(dripRadius(1)).toBe(1);
		expect(dripRadius(0.25) ** 2).toBeCloseTo(0.25);
		expect(dripRadius(0.5) ** 2).toBeCloseTo(0.5);
		expect(dripRadius(2)).toBe(1);
		expect(dripRadius(-1)).toBe(0);
	});

	it("the centre hangs further from the wall as the drip fills, past flush at the end", () => {
		expect(dripHang(0)).toBe(DRIP_HANG_MIN);
		expect(dripHang(1)).toBe(DRIP_HANG_MAX);
		expect(DRIP_HANG_MAX).toBeGreaterThan(1);
		expect(DRIP_HANG_MIN).toBeLessThan(1);
		let previous = dripHang(0);
		for (let f = 0.05; f <= 1; f += 0.05) {
			expect(dripHang(f)).toBeGreaterThan(previous);
			previous = dripHang(f);
		}
		// Sags faster as it gets heavier
		expect(dripHang(1) - dripHang(0.8)).toBeGreaterThan(dripHang(0.2) - dripHang(0));
	});

	it("the centre sits out from the wall by the hang and along it toward the heading", () => {
		const fresh = dripOffset(0, 1, 0, 0.6, 0.8);
		expect(fresh.x).toBeCloseTo(DRIP_HANG_MIN);
		expect(fresh.y).toBeCloseTo(0.8 * DRIP_LEAN);
		const ripe = dripOffset(1, 1, 0, 0.6, 0.8);
		expect(ripe.x).toBeCloseTo(DRIP_HANG_MAX);
		// Leaning forward from the first bead, by as much when ripe
		expect(ripe.y).toBeCloseTo(fresh.y);
		// Its back edge stays near where it formed, the front swells out ahead
		expect(fresh.y + 1).toBeGreaterThan(3 * (1 - fresh.y));
		// Mirrored heading, mirrored lean; straight out, no lean
		expect(dripOffset(0.5, 1, 0, 0.6, -0.8).y).toBeCloseTo(-dripOffset(0.5, 1, 0, 0.6, 0.8).y);
		const straight = dripOffset(0.5, 0, -1, 0, -1);
		expect(straight.x).toBeCloseTo(0);
		expect(straight.y).toBeCloseTo(-dripHang(0.5));
	});
});
