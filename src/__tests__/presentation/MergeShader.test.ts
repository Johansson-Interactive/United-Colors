import { JELLY_MAX_STRETCH } from "../../application/jelly";
import { createSceneBuilder } from "../../application/renderScene";
import {
	dotCount,
	dotKind,
	findPlayer,
	readDot,
	sceneDot,
	sceneLength,
	setDent,
	setNeck,
	setStretch,
	setWall,
	writeDot,
} from "../../application/sceneRecord";
import type { DotView, RenderFrame } from "../../domain/types";
import { LIQUID_WOBBLE } from "../../presentation/liquidShader";
import {
	DENT_GAP,
	DENT_SOFTNESS,
	MERGE_BLEND,
	MERGE_MAX_BLOBS,
	MERGE_PACKED_LENGTH,
	MERGE_SKSL,
	mergeUniformsByName,
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
		setStretch(s, findPlayer(s), 0.1, -0.05, 3);
		const values = packMergeUniforms(s)?.values ?? [];
		expect(values.slice(MERGE_MAX_BLOBS * 3 + 2, MERGE_MAX_BLOBS * 3 + 5)).toEqual([
			Math.fround(0.1),
			Math.fround(-0.05),
			3,
		]);
		expect(MERGE_SKSL).toContain("uniform float3 jelly;");
	});

	it("holds in its body every dot the scene draws merging, however many are caught", () => {
		const many = Array.from({ length: MERGE_MAX_BLOBS + 3 }, (_, i) =>
			dot({ id: `c${i}`, x: 60 + i, y: 60, absorb: 0 }),
		);
		const s = scene([PLAYER, ...many]);
		let merging = 0;
		for (let i = 0; i < dotCount(s); i++) if (dotKind(s, i) === "merging") merging++;
		expect(merging).toBe(MERGE_MAX_BLOBS - 1);
		expect(packMergeUniforms(s)?.values[MERGE_MAX_BLOBS * 3]).toBe(MERGE_MAX_BLOBS);
	});

	it("reads body positions from the scene layout the shader expects", () => {
		const s = scene([PLAYER]);
		expect(readDot(s, findPlayer(s), sceneDot())).toMatchObject({ x: 50, y: 60, radius: 20 });
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
		const player = findPlayer(s);
		setWall(s, player, 0, { nx: 1, ny: 0, x: 0, y: 60 });
		setWall(s, player, 1, { nx: 0, ny: -1, x: 50, y: 800 });
		setNeck(s, player, 5);
		const packed = packMergeUniforms(s);
		expect(packed?.values.slice(MERGE_MAX_BLOBS * 3 + 9)).toEqual([1, 0, 0, 0, -1, -800, 5]);
		const pad = (20 * MERGE_BLEND) / 4 + 5 + 1;
		const reach = 20 * (1 + JELLY_MAX_STRETCH) * (1 + LIQUID_WOBBLE);
		expect(packed?.left).toBeCloseTo(50 - reach - pad);
	});

	it("finds the player and the one dent through the scene record, wherever they sit", () => {
		const s = new Float32Array(sceneLength(4));
		writeDot(s, 0, "rejected", 75, 60, 10, 0);
		setDent(s, 0, 1);
		writeDot(s, 1, "player", 50, 60, 20, 1);
		writeDot(s, 2, "rejected", 300, 300, 4, 0);
		setDent(s, 2, 1);
		writeDot(s, 3, "merging", 70, 60, 5, 1);
		const values = packMergeUniforms(s)?.values ?? [];
		expect(values.slice(0, 6)).toEqual([50, 60, 20, 70, 60, 5]);
		const dent = values.slice(MERGE_MAX_BLOBS * 3 + 5, MERGE_MAX_BLOBS * 3 + 9);
		expect(dent.slice(0, 3)).toEqual([75, 60, 10 * (1 + DENT_GAP)]);
	});
});

describe("merge uniforms by name", () => {
	/** Each uniform MERGE_SKSL declares, in order, with the floats it takes */
	function declared(): Array<[string, number]> {
		const found: Array<[string, number]> = [];
		for (const m of MERGE_SKSL.matchAll(/uniform float(\d?) (\w+)(?:\[(\d+)\])?;/g)) {
			found.push([m[2], Number(m[1] || 1) * Number(m[3] ?? 1)]);
		}
		return found;
	}

	it("names every uniform the shader declares, in order, with its size", () => {
		const values = Array.from({ length: MERGE_PACKED_LENGTH }, (_, i) => i);
		const named = mergeUniformsByName(values, [0.1, 0.2, 0.3, 1]);
		expect(Object.keys(named)).toEqual(declared().map(([name]) => name));
		for (const [name, size] of declared()) {
			const value = named[name];
			expect(Array.isArray(value) ? value.length : 1).toBe(size);
		}
	});

	it("keeps the packed values in declaration order", () => {
		const scene = createSceneBuilder()(
			{
				phase: "RUNNING",
				score: 0,
				dots: [dot({ kind: "player", color: "#E91E63" })],
				events: [],
			} as RenderFrame,
			0,
			{ x: 100, y: 100 },
		);
		const packed = packMergeUniforms(scene);
		expect(packed?.values.length).toBe(MERGE_PACKED_LENGTH);
		const named = mergeUniformsByName(packed?.values ?? [], [0, 0, 0, 1]);
		const flat = declared()
			.slice(0, -1)
			.flatMap(([name]) => named[name]);
		expect(flat).toEqual(packed?.values);
	});
});
