import { describe, expect, it } from "vitest";
import { lightCentre, ROOM_SKSL, roomUniforms, stageCover } from "../../presentation/room";

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

	it("declares the room shader's uniforms in the order roomUniforms names them", () => {
		const names = [...ROOM_SKSL.matchAll(/uniform \w+ (\w+);/g)].map((m) => m[1]);
		const uniforms = roomUniforms(400, 800, 0, 0, [0, 0, 0], [1, 0, 0, 1], 3);
		expect(names).toEqual(Object.keys(uniforms));
	});

	it("lights the room where the tilt puts the light, washing its edges in the accent", () => {
		const uniforms = roomUniforms(400, 800, 0.2, -0.1, [0.1, 0.2, 0.3], [1, 0.5, 0, 1], 3);
		const centre = lightCentre(400, 800, 0.2, -0.1);
		expect(uniforms.light).toEqual([centre.x, centre.y]);
		expect(uniforms.washCentre).toEqual([200, 400]);
		expect(uniforms.lightRadius).toBeGreaterThan(0);
		expect(uniforms.washRadius).toBeGreaterThan(0);
		expect(uniforms.ink).toEqual([0.1, 0.2, 0.3]);
		expect(uniforms.accent).toEqual([1, 0.5, 0]);
		expect(uniforms.pixelRatio).toBe(3);
	});

	it("dithers the room by one 8-bit step either way, per device pixel", () => {
		// Two uniform hashes summed: triangular noise, the same at every level
		expect(ROOM_SKSL).toContain("floor(p * pixelRatio)");
		expect(ROOM_SKSL).toContain("hash(px) + hash(px + float2(57.0, 113.0)) - 1.0");
		expect(ROOM_SKSL).toContain("n / 255.0");
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
