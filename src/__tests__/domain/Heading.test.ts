import {
	SMALL_DOT_HEADING_SPREAD,
	SMALL_DOT_HEADING_SPREAD_AT_CORNER,
} from "../../domain/constants";
import { type EdgeHeading, edgeHeading } from "../../domain/engine/Heading";

/** Degrees between a heading and the inward normal of its edge */
const fromNormal = (h: EdgeHeading) => (Math.atan2(Math.abs(h.tangent), h.normal) * 180) / Math.PI;

const ALONGS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const ROLLS = [0, 0.001, 0.25, 0.5, 0.75, 0.999];

describe("edgeHeading", () => {
	it("is a unit vector heading into the screen", () => {
		for (const along of ALONGS) {
			for (const sideRoll of ROLLS) {
				for (const spreadRoll of ROLLS) {
					const h = edgeHeading(along, sideRoll, spreadRoll);
					expect(Math.hypot(h.normal, h.tangent)).toBeCloseTo(1);
					expect(h.normal).toBeGreaterThan(0);
				}
			}
		}
	});

	it("sets off on the diagonal give or take the spread: never across the screen, never along the edge", () => {
		const low = 45 - SMALL_DOT_HEADING_SPREAD;
		const high = 45 + SMALL_DOT_HEADING_SPREAD;
		expect(fromNormal(edgeHeading(0.5, 0.5, 0))).toBeCloseTo(low);
		expect(fromNormal(edgeHeading(0.5, 0.5, 0.5))).toBeCloseTo(45);
		expect(fromNormal(edgeHeading(0.5, 0.5, 1))).toBeCloseTo(high);
		for (const along of ALONGS) {
			for (const sideRoll of ROLLS) {
				for (const spreadRoll of ROLLS) {
					const angle = fromNormal(edgeHeading(along, sideRoll, spreadRoll));
					expect(angle).toBeGreaterThanOrEqual(low - 1e-9);
					expect(angle).toBeLessThanOrEqual(high + 1e-9);
				}
			}
		}
	});

	it("may head either way along the edge from its middle", () => {
		expect(edgeHeading(0.5, 0.25, 0.5).tangent).toBeGreaterThan(0);
		expect(edgeHeading(0.5, 0.75, 0.5).tangent).toBeLessThan(0);
	});

	it("heads away from a corner it spawns at, in a band narrowed to the corner spread", () => {
		const low = 45 - SMALL_DOT_HEADING_SPREAD_AT_CORNER;
		const high = 45 + SMALL_DOT_HEADING_SPREAD_AT_CORNER;
		for (const sideRoll of ROLLS) {
			expect(edgeHeading(1, sideRoll, 0.5).tangent).toBeLessThan(0);
			expect(edgeHeading(0, sideRoll, 0.5).tangent).toBeGreaterThan(0);
		}
		expect(fromNormal(edgeHeading(1, 0.5, 0))).toBeCloseTo(low);
		expect(fromNormal(edgeHeading(1, 0.5, 1))).toBeCloseTo(high);
		expect(fromNormal(edgeHeading(0, 0.5, 1))).toBeCloseTo(high);
	});

	it("turns away from the nearer corner more surely, and in a narrower band, the closer it is", () => {
		// Three quarters of the way to the far corner: away three times in four
		expect(edgeHeading(0.75, 0.7, 0.5).tangent).toBeLessThan(0);
		expect(edgeHeading(0.75, 0.8, 0.5).tangent).toBeGreaterThan(0);
		const midSpread = (SMALL_DOT_HEADING_SPREAD + SMALL_DOT_HEADING_SPREAD_AT_CORNER) / 2;
		expect(fromNormal(edgeHeading(0.75, 0.5, 1))).toBeCloseTo(45 + midSpread);
		expect(fromNormal(edgeHeading(0.25, 0.5, 0))).toBeCloseTo(45 - midSpread);
	});
});
