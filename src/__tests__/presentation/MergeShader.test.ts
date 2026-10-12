import { JELLY_MAX_STRETCH } from "../../application/jelly";
import {
	createSceneBuilder,
	SCENE_KIND,
	SCENE_KIND_MERGING,
	SCENE_NECK,
	SCENE_RADIUS,
	SCENE_STRETCH_X,
	SCENE_STRETCH_Y,
	SCENE_STRIDE,
	SCENE_WALL_C,
	SCENE_WALL_X,
	SCENE_WALL2_C,
	SCENE_WALL2_Y,
	SCENE_WOBBLE,
	SCENE_X,
	SCENE_Y,
} from "../../application/renderScene";
import type { DotView, RenderFrame } from "../../domain/types";
import { LIQUID_WOBBLE } from "../../presentation/liquidShader";
import {
	DENT_GAP,
	DENT_SOFTNESS,
	MERGE_BLEND,
	MERGE_MAX_BLOBS,
	MERGE_SKSL,
	packMergeUniforms,
} from "../../presentation/mergeShader";

function dot(partial: Partial<DotView>): DotView {
	return {
		id: "d",
		x: 100,
		y: 100,
		radius: 10,
		prevRadius: 10,
		color: "#E91E63",
		kind: "small",
		vx: 0,
		vy: 0,
		...partial,
	};
}

function scene(dots: DotView[], player = { x: 50, y: 60 }): Float32Array {
	const frame: RenderFrame = { phase: "RUNNING", score: 0, dots, events: [] };
	return createSceneBuilder()(frame, 0, player);
}

const PLAYER = dot({ id: "p", kind: "player", radius: 20 });

describe("packMergeUniforms", () => {
	it("returns null without a player (kiosk)", () => {
		expect(packMergeUniforms(scene([dot({})]))).toBeNull();
	});

	it("packs the player first, then each merging dot, padded to MERGE_MAX_BLOBS", () => {
		const s = scene([
			PLAYER,
			dot({ id: "free", x: 300, y: 300 }),
			dot({ id: "c", x: 80, y: 60, absorb: 0 }),
		]);
		const packed = packMergeUniforms(s);
		expect(packed).not.toBeNull();
		const values = packed?.values ?? [];
		expect(values.slice(0, 3)).toEqual([50, 60, 20]);
		expect(values.slice(3, 6)).toEqual([80, 60, 10]);
		// Unused slots are zero; then count, blend radius and the player's jelly (round, at rest)
		expect(values.slice(6, MERGE_MAX_BLOBS * 3).every((v) => v === 0)).toBe(true);
		expect(values[MERGE_MAX_BLOBS * 3]).toBe(2);
		expect(values[MERGE_MAX_BLOBS * 3 + 1]).toBeCloseTo(20 * MERGE_BLEND);
		expect(values.slice(MERGE_MAX_BLOBS * 3 + 2, MERGE_MAX_BLOBS * 3 + 5)).toEqual([0, 0, 0]);
		// No dent: zero radius
		expect(values[MERGE_MAX_BLOBS * 3 + 7]).toBe(0);
		// No walls, no neck
		expect(values.slice(MERGE_MAX_BLOBS * 3 + 9)).toEqual([0, 0, 0, 0, 0, 0, 0]);
		expect(values).toHaveLength(MERGE_MAX_BLOBS * 3 + 16);
	});

	it("bounds cover every body, the player at full stretch and wobble, plus the bulge", () => {
		const s = scene([PLAYER, dot({ id: "c", x: 80, y: 60, absorb: 0 })]);
		const packed = packMergeUniforms(s);
		const pad = (20 * MERGE_BLEND) / 4 + 1;
		const reach = 20 * (1 + JELLY_MAX_STRETCH) * (1 + LIQUID_WOBBLE);
		expect(packed?.left).toBeCloseTo(50 - reach - pad);
		expect(packed?.top).toBeCloseTo(60 - reach - pad);
		expect(packed?.right).toBeCloseTo(90 + pad);
		expect(packed?.bottom).toBeCloseTo(60 + reach + pad);
	});

	it("passes the player's stretch and wobble clock from the scene to the shader", () => {
		const s = scene([PLAYER]);
		s[SCENE_STRETCH_X] = 0.1;
		s[SCENE_STRETCH_Y] = -0.05;
		s[SCENE_WOBBLE] = 3;
		const values = packMergeUniforms(s)?.values ?? [];
		expect(values.slice(MERGE_MAX_BLOBS * 3 + 2, MERGE_MAX_BLOBS * 3 + 5)).toEqual([
			Math.fround(0.1),
			Math.fround(-0.05),
			3,
		]);
		expect(MERGE_SKSL).toContain("uniform float3 jelly;");
	});

	it("never packs more than MERGE_MAX_BLOBS bodies", () => {
		const many = Array.from({ length: MERGE_MAX_BLOBS + 3 }, (_, i) =>
			dot({ id: `c${i}`, x: 60 + i, y: 60, absorb: 0 }),
		);
		const s = scene([PLAYER, ...many]);
		let merging = 0;
		for (let i = 0; i < s.length; i += SCENE_STRIDE) {
			if (s[i + SCENE_KIND] === SCENE_KIND_MERGING) merging++;
		}
		expect(merging).toBe(MERGE_MAX_BLOBS + 3);
		const packed = packMergeUniforms(s);
		expect(packed?.values[MERGE_MAX_BLOBS * 3]).toBe(MERGE_MAX_BLOBS);
	});

	it("reads body positions from the scene layout the shader expects", () => {
		const s = scene([PLAYER]);
		expect([s[SCENE_X], s[SCENE_Y], s[SCENE_RADIUS]]).toEqual([50, 60, 20]);
		expect(MERGE_SKSL).toContain(`uniform float3 blobs[${MERGE_MAX_BLOBS}]`);
	});

	it("cuts a soft dent the shape of a refused dot, a little wider", () => {
		const s = scene([PLAYER, dot({ id: "r", x: 75, y: 60, reject: 0.3, prevReject: 0.3 })]);
		const values = packMergeUniforms(s)?.values ?? [];
		const dent = values.slice(MERGE_MAX_BLOBS * 3 + 5, MERGE_MAX_BLOBS * 3 + 9);
		expect(dent[2]).toBeCloseTo(10 * (1 + DENT_GAP));
		expect(dent[3]).toBeCloseTo(10 * DENT_SOFTNESS);
		expect(MERGE_SKSL).toContain("uniform float4 dent;");
	});

	it("leaves a hard edge once the dot is pushed clear, so no dent lingers", () => {
		const s = scene([PLAYER, dot({ id: "r", x: 80, y: 60, reject: 1, prevReject: 1 })]);
		expect(packMergeUniforms(s)?.values[MERGE_MAX_BLOBS * 3 + 8]).toBe(0);
	});

	it("passes the walls the player is pressed into, with the neck, and pads the bounds by it", () => {
		const s = scene([PLAYER]);
		s[SCENE_WALL_X] = 1;
		s[SCENE_WALL_C] = 0;
		s[SCENE_WALL2_Y] = -1;
		s[SCENE_WALL2_C] = -800;
		s[SCENE_NECK] = 5;
		const packed = packMergeUniforms(s);
		expect(packed?.values.slice(MERGE_MAX_BLOBS * 3 + 9)).toEqual([1, 0, 0, 0, -1, -800, 5]);
		const pad = (20 * MERGE_BLEND) / 4 + 5 + 1;
		const reach = 20 * (1 + JELLY_MAX_STRETCH) * (1 + LIQUID_WOBBLE);
		expect(packed?.left).toBeCloseTo(50 - reach - pad);
	});
});
