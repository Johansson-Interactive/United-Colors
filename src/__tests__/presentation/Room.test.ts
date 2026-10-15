import { describe, expect, it } from "vitest";
import { lightCentre, stageCover } from "../../presentation/room";

/** Premultiplied source-over, one channel plus alpha */
function over(src: { c: number; a: number }, dst: { c: number; a: number }) {
	return { c: src.c + dst.c * (1 - src.a), a: src.a + dst.a * (1 - src.a) };
}

describe("room", () => {
	it("centres the light high in the room when the phone is level", () => {
		expect(lightCentre(400, 800, 0, 0)).toEqual({ x: 200, y: 240 });
	});

	it("slides the light against the tilt", () => {
		const level = lightCentre(400, 800, 0, 0);
		const tilted = lightCentre(400, 800, 0.2, -0.1);
		expect(tilted.x).toBeLessThan(level.x);
		expect(tilted.y).toBeGreaterThan(level.y);
	});

	it("leaves the scene uncovered while the stage is fully shown", () => {
		expect(stageCover(1)).toBe(0);
		expect(stageCover(0)).toBe(1);
		expect(stageCover(1.2)).toBe(0);
	});

	it("covering with the room gives the same pixels as fading the scene over it", () => {
		const room = { c: 0.3, a: 1 };
		const scene = { c: 0.4, a: 0.6 };
		for (const opacity of [0, 0.25, 0.5, 0.9, 1]) {
			const faded = over({ c: scene.c * opacity, a: scene.a * opacity }, room);
			const cover = stageCover(opacity);
			const covered = over({ c: room.c * cover, a: cover }, over(scene, room));
			expect(covered.c).toBeCloseTo(faded.c, 10);
			expect(covered.a).toBeCloseTo(faded.a, 10);
		}
	});
});
