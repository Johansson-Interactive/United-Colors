import { createSceneBuilder } from "../../application/renderScene";
import { DRIP_NECK } from "../../application/wall";
import { SMALL_DOT_SIZE_RATIO } from "../../domain/constants";
import type { DotView, RenderFrame } from "../../domain/types";
import { SMIN_SKSL, WALL_SKSL } from "../../presentation/liquidShader";
import { MERGE_SKSL } from "../../presentation/mergeShader";
import { packWallDropUniforms, WALL_DROP_SKSL } from "../../presentation/wallDropShader";

function scene(dots: DotView[]): Float32Array {
	const frame: RenderFrame = { phase: "KIOSK", score: 0, dots, events: [] };
	return createSceneBuilder()(frame, 0, { x: 50, y: 60 });
}

const FULL = (SMALL_DOT_SIZE_RATIO * 400) / 2;
const LAUNCHED: DotView = {
	id: "d",
	x: 30,
	y: 100,
	radius: FULL,
	prevRadius: FULL,
	color: "#E91E63",
	kind: "small",
	vx: 6,
	vy: 8,
	launch: { wall: { nx: 1, ny: 0, x: 0, y: 100 }, progress: 0.5, prev: 0.5 },
};

describe("wall drop shader", () => {
	it("declares its uniforms in the order they are packed, colour last", () => {
		const names = [...WALL_DROP_SKSL.matchAll(/uniform \w+ (\w+);/g)].map((m) => m[1]);
		expect(names).toEqual(["center", "radius", "stretch", "wall", "neck", "color"]);
		const packed = packWallDropUniforms(scene([LAUNCHED]), 0);
		// center (2), radius, stretch (2), wall (3), neck
		expect(packed.values).toHaveLength(9);
	});

	it("packs the dot's centre, radius, stretch, wall and neck from its record", () => {
		const packed = packWallDropUniforms(scene([LAUNCHED]), 0);
		const [x, y, radius, stretchX, stretchY, nx, ny, c, neck] = packed.values;
		expect([x, y, radius]).toEqual([30, 100, FULL]);
		expect(stretchX / stretchY).toBeCloseTo(6 / 8);
		expect(Math.hypot(stretchX, stretchY)).toBeGreaterThan(0);
		expect([nx, ny, c]).toEqual([1, 0, 0]);
		expect(neck).toBeCloseTo(FULL * DRIP_NECK);
	});

	it("bounds cover the stretched dot and the fillet along the wall", () => {
		const packed = packWallDropUniforms(scene([LAUNCHED]), 0);
		const [, , radius, stretchX, stretchY, , , , neck] = packed.values;
		const reach = radius * (1 + Math.hypot(stretchX, stretchY)) + neck + 1;
		expect(packed.left).toBeCloseTo(30 - reach);
		expect(packed.right).toBeCloseTo(30 + reach);
		expect(packed.top).toBeCloseTo(100 - reach);
		expect(packed.bottom).toBeCloseTo(100 + reach);
	});

	it("meets the wall the same way the player's liquid does", () => {
		expect(WALL_DROP_SKSL).toContain(SMIN_SKSL);
		expect(WALL_DROP_SKSL).toContain(WALL_SKSL);
		expect(MERGE_SKSL).toContain(WALL_SKSL);
		expect(MERGE_SKSL).toContain("uniform float3 walls[2];");
		expect(MERGE_SKSL).toContain("uniform float neck;");
	});
});
