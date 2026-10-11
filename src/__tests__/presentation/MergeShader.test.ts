import { JELLY_MAX_STRETCH } from "../../application/jelly";
import {
	createSceneBuilder,
	SCENE_KIND,
	SCENE_KIND_MERGING,
	SCENE_RADIUS,
	SCENE_STRETCH_X,
	SCENE_STRETCH_Y,
	SCENE_STRIDE,
	SCENE_WOBBLE,
	SCENE_X,
	SCENE_Y,
} from "../../application/renderScene";
import type { DotView, RenderFrame } from "../../domain/types";
import {
	MERGE_BLEND,
	MERGE_MAX_BLOBS,
	MERGE_SKSL,
	MERGE_WOBBLE,
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
	const frame: RenderFrame = { phase: "RUNNING", score: 0, dots };
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
		expect(values.slice(MERGE_MAX_BLOBS * 3 + 2)).toEqual([0, 0, 0]);
		expect(values).toHaveLength(MERGE_MAX_BLOBS * 3 + 5);
	});

	it("bounds cover every body, the player at full stretch and wobble, plus the bulge", () => {
		const s = scene([PLAYER, dot({ id: "c", x: 80, y: 60, absorb: 0 })]);
		const packed = packMergeUniforms(s);
		const pad = (20 * MERGE_BLEND) / 4 + 1;
		const reach = 20 * (1 + JELLY_MAX_STRETCH) * (1 + MERGE_WOBBLE);
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
		expect(values.slice(MERGE_MAX_BLOBS * 3 + 2)).toEqual([
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
});
