import { createSceneBuilder } from "../../application/renderScene";
import { HAS_WALL_SKSL, readDot, type SceneDot, sceneDot } from "../../application/sceneRecord";
import { DRIP_NECK } from "../../application/wall";
import { SMALL_DOT_SIZE_RATIO } from "../../domain/constants";
import type { DotView, RenderFrame } from "../../domain/types";
import { SMIN_SKSL, WALL_SKSL } from "../../presentation/liquidShader";
import { MERGE_SKSL } from "../../presentation/mergeShader";
import {
	packWallDropUniforms,
	WALL_DROP_SKSL,
	WALL_DROP_SLOTS,
	wallDropSlots,
	wallDropUniformsByName,
} from "../../presentation/wallDropShader";

/** The scene built from `dots`, as the drawer gets it */
function sceneOf(dots: DotView[]): Float32Array {
	const frame: RenderFrame = { phase: "KIOSK", score: 0, dots, events: [] };
	return createSceneBuilder()(frame, 0, { x: 50, y: 60 });
}

/** The first dot of the scene built from `dots`, read back as the drawer reads it */
function drawn(dots: DotView[]): SceneDot {
	return readDot(sceneOf(dots), 0, sceneDot());
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
		const packed = packWallDropUniforms(drawn([LAUNCHED]));
		// center (2), radius, stretch (2), wall (3), neck
		expect(packed.values).toHaveLength(9);
	});

	it("packs the dot's centre, radius, stretch, wall and neck from its record", () => {
		const packed = packWallDropUniforms(drawn([LAUNCHED]));
		const [x, y, radius, stretchX, stretchY, nx, ny, c, neck] = packed.values;
		expect([x, y, radius]).toEqual([30, 100, FULL]);
		expect(stretchX / stretchY).toBeCloseTo(6 / 8);
		expect(Math.hypot(stretchX, stretchY)).toBeGreaterThan(0);
		expect([nx, ny, c]).toEqual([1, 0, 0]);
		expect(neck).toBeCloseTo(FULL * DRIP_NECK);
	});

	it("bounds cover the stretched dot and the fillet along the wall", () => {
		const packed = packWallDropUniforms(drawn([LAUNCHED]));
		const [, , radius, stretchX, stretchY, , , , neck] = packed.values;
		const reach = radius * (1 + Math.hypot(stretchX, stretchY)) + neck + 1;
		expect(packed.left).toBeCloseTo(30 - reach);
		expect(packed.right).toBeCloseTo(30 + reach);
		expect(packed.top).toBeCloseTo(100 - reach);
		expect(packed.bottom).toBeCloseTo(100 + reach);
	});

	it("judges a zero wall normal as no wall the way the scene record does", () => {
		expect(WALL_SKSL).toContain(HAS_WALL_SKSL);
		expect(WALL_SKSL).toContain("if (!hasWall(wall)) return d;");
	});

	it("meets the wall the same way the player's liquid does", () => {
		expect(WALL_DROP_SKSL).toContain(SMIN_SKSL);
		expect(WALL_DROP_SKSL).toContain(WALL_SKSL);
		expect(MERGE_SKSL).toContain(WALL_SKSL);
		expect(MERGE_SKSL).toContain("uniform float3 walls[2];");
		expect(MERGE_SKSL).toContain("uniform float neck;");
	});
});

describe("wall drop uniforms by name", () => {
	/** Each uniform WALL_DROP_SKSL declares, in order, with the floats it takes */
	function declared(): Array<[string, number]> {
		const found: Array<[string, number]> = [];
		for (const m of WALL_DROP_SKSL.matchAll(/uniform float(\d?) (\w+);/g)) {
			found.push([m[2], Number(m[1] || 1)]);
		}
		return found;
	}

	it("names every uniform the shader declares, in order, with its size", () => {
		const named = wallDropUniformsByName([0, 1, 2, 3, 4, 5, 6, 7, 8], [0.1, 0.2, 0.3, 1]);
		expect(Object.keys(named)).toEqual(declared().map(([name]) => name));
		for (const [name, size] of declared()) {
			const value = named[name];
			expect(Array.isArray(value) ? value.length : 1).toBe(size);
		}
	});

	it("keeps the packed values in declaration order, colour last", () => {
		const packed = packWallDropUniforms(drawn([LAUNCHED]));
		const named = wallDropUniformsByName(packed.values, [0.1, 0.2, 0.3, 1]);
		const flat = declared().flatMap(([name]) => named[name]);
		expect(flat).toEqual([...packed.values, 0.1, 0.2, 0.3, 1]);
	});
});

describe("wall drop slots", () => {
	const COLORS = [
		[1, 0, 0, 1],
		[0, 1, 0, 1],
		[0, 0, 1, 1],
	];
	const free: DotView = { ...LAUNCHED, id: "free", x: 200, y: 300, launch: undefined };
	const dropAt = (id: string, y: number): DotView => ({
		...LAUNCHED,
		id,
		y,
		launch: { wall: { nx: 1, ny: 0, x: 0, y }, progress: 0.5, prev: 0.5 },
	});

	it("fills a slot per drop at a wall, in scene order, and leaves free dots to the picture", () => {
		const scene = sceneOf([dropAt("a", 100), free, dropAt("b", 400)]);
		const slots = wallDropSlots(scene, COLORS);
		expect(slots).toHaveLength(WALL_DROP_SLOTS);
		const a = packWallDropUniforms(readDot(scene, 0, sceneDot()));
		expect(slots[0]).toMatchObject({
			x: a.left,
			y: a.top,
			width: a.right - a.left,
			height: a.bottom - a.top,
		});
		expect(slots[0].uniforms.center).toEqual([30, 100]);
		expect(slots[1].uniforms.center).toEqual([30, 400]);
		const color = COLORS[readDot(scene, 0, sceneDot()).color];
		expect(slots[0].uniforms.color).toEqual(color);
	});

	it("leaves unused slots empty, so the shader draws nothing there", () => {
		const slots = wallDropSlots(sceneOf([free]), COLORS);
		for (const slot of slots) {
			expect(slot.width * slot.height).toBe(0);
			expect(slot.uniforms.color[3]).toBe(0);
		}
	});

	it("holds only the first WALL_DROP_SLOTS drops; the drawer draws the rest", () => {
		const many = Array.from({ length: WALL_DROP_SLOTS + 2 }, (_, i) =>
			dropAt(`d${i}`, 100 + i * 50),
		);
		const slots = wallDropSlots(sceneOf(many), COLORS);
		expect(slots.map((s) => s.uniforms.center[1])).toEqual(
			many.slice(0, WALL_DROP_SLOTS).map((d) => d.y),
		);
	});
});
