import {
	createSceneBuilder,
	MERGE_SWELL_MAX,
	mergeSlide,
	mergeSwell,
	SCENE_COLOR,
	SCENE_KIND,
	SCENE_KIND_MERGING,
	SCENE_KIND_PLAYER,
	SCENE_KIND_POINT,
	SCENE_KIND_SMALL,
	SCENE_MERGE,
	SCENE_RADIUS,
	SCENE_STRETCH_X,
	SCENE_STRETCH_Y,
	SCENE_STRIDE,
	SCENE_WOBBLE,
	SCENE_X,
	SCENE_Y,
} from "../../application/renderScene";
import { ABSORB_MERGE_FRACTION, GAME_COLORS } from "../../domain/constants";
import type { DotView, GamePhase, RenderFrame } from "../../domain/types";

const KIND_NAMES = {
	[SCENE_KIND_SMALL]: "small",
	[SCENE_KIND_POINT]: "point",
	[SCENE_KIND_PLAYER]: "player",
	[SCENE_KIND_MERGING]: "merging",
} as Record<number, DotView["kind"] | "merging">;

/** Decode the flat scene back into one object per dot, for readable assertions */
function decode(scene: Float32Array) {
	const dots = [];
	for (let i = 0; i < scene.length; i += SCENE_STRIDE) {
		dots.push({
			x: scene[i + SCENE_X],
			y: scene[i + SCENE_Y],
			radius: scene[i + SCENE_RADIUS],
			color: GAME_COLORS[scene[i + SCENE_COLOR]],
			kind: KIND_NAMES[scene[i + SCENE_KIND]],
			merge: scene[i + SCENE_MERGE],
		});
	}
	return dots;
}

function buildScene(f: RenderFrame, alpha: number, player: { x: number; y: number }) {
	return decode(createSceneBuilder()(f, alpha, player));
}

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

function frame(dots: DotView[], phase: GamePhase = "RUNNING"): RenderFrame {
	return { phase, score: 0, dots };
}

const PLAYER_POS = { x: 50, y: 60 };

describe("buildScene", () => {
	it("extrapolates moving dots along their per-tick velocity", () => {
		const [d] = buildScene(frame([dot({ vx: 8, vy: -4 })]), 0.5, PLAYER_POS);
		expect(d.x).toBe(104);
		expect(d.y).toBe(98);
		expect(d.kind).toBe("small");
	});

	it("draws dots exactly at tick position at alpha 0 and next tick position at alpha 1", () => {
		const f = frame([dot({ vx: 8, vy: 2 })]);
		expect(buildScene(f, 0, PLAYER_POS)[0]).toMatchObject({ x: 100, y: 100 });
		expect(buildScene(f, 1, PLAYER_POS)[0]).toMatchObject({ x: 108, y: 102 });
	});

	it("interpolates size animations from the previous tick", () => {
		const [d] = buildScene(
			frame([dot({ kind: "point", prevRadius: 0, radius: 20 })]),
			0.25,
			PLAYER_POS,
		);
		expect(d.radius).toBe(5);
	});

	it("draws the player at its live position, last (on top)", () => {
		const scene = buildScene(
			frame([dot({ kind: "player", x: 0, y: 0, radius: 25, color: "#2196F3" }), dot({ id: "s" })]),
			0.5,
			PLAYER_POS,
		);
		expect(scene).toHaveLength(2);
		expect(scene[1]).toEqual({
			x: 50,
			y: 60,
			radius: 25,
			color: "#2196F3",
			kind: "player",
			merge: 0,
		});
	});

	it("gives only the moving player a liquid stretch, and none while frozen", () => {
		const build = createSceneBuilder();
		const player = dot({ kind: "player", radius: 25 });
		const free = dot({});
		const last = (scene: Float32Array) => scene.length - SCENE_STRIDE;
		let scene = build(frame([free, player]), 0, { x: 50, y: 60 }, 16);
		for (let i = 1; i <= 30; i++)
			scene = build(frame([free, player]), 0, { x: 50 + 10 * i, y: 60 }, 16);
		expect(Math.abs(scene[last(scene) + SCENE_STRETCH_X])).toBeGreaterThan(0);
		expect(scene[last(scene) + SCENE_WOBBLE]).toBeGreaterThan(0);
		expect([scene[SCENE_STRETCH_X], scene[SCENE_STRETCH_Y], scene[SCENE_WOBBLE]]).toEqual([
			0, 0, 0,
		]);

		const moving = Array.from(scene.subarray(last(scene)));
		const paused = build(frame([free, player], "PAUSED"), 0, { x: 400, y: 60 }, 16);
		expect(Array.from(paused.subarray(last(paused) + SCENE_STRETCH_X))).toEqual(
			moving.slice(SCENE_STRETCH_X),
		);
	});

	it("omits the player when not in the frame (kiosk)", () => {
		const scene = buildScene(frame([dot({})], "KIOSK"), 0.5, PLAYER_POS);
		expect(scene).toHaveLength(1);
	});

	it.each(["PAUSED", "GAME_OVER"] as const)("freezes dots at tick state when %s", (phase) => {
		const [d] = buildScene(
			frame([dot({ vx: 8, vy: 8, prevRadius: 0, radius: 20 })], phase),
			0.7,
			PLAYER_POS,
		);
		expect(d).toMatchObject({ x: 100, y: 100, radius: 20 });
	});

	it("encodes each dot's colour as its GAME_COLORS index and its kind", () => {
		const scene = buildScene(
			frame([
				dot({ kind: "point", color: GAME_COLORS[2] }),
				dot({ kind: "small", color: GAME_COLORS[1] }),
			]),
			0,
			PLAYER_POS,
		);
		expect(scene.map((d) => [d.color, d.kind])).toEqual([
			[GAME_COLORS[2], "point"],
			[GAME_COLORS[1], "small"],
		]);
	});

	it("reuses one buffer but returns a new view each frame", () => {
		// Worklets caches serialized values by identity, so a reused view would resend stale data
		const build = createSceneBuilder();
		const f = frame([dot({}), dot({})]);
		const first = build(f, 0, PLAYER_POS);
		const second = build(f, 0.5, PLAYER_POS);
		expect(second).not.toBe(first);
		expect(second.buffer).toBe(first.buffer);
		expect(second).toHaveLength(2 * SCENE_STRIDE);
	});

	it("grows the buffer when the dot count no longer fits", () => {
		const build = createSceneBuilder();
		build(frame([dot({})]), 0, PLAYER_POS);
		const scene = build(frame([dot({}), dot({}), dot({ kind: "player" })]), 0, PLAYER_POS);
		expect(decode(scene)).toHaveLength(3);
		expect(decode(scene)[2]).toMatchObject({ x: 50, y: 60, kind: "player" });
	});

	describe("merging dots", () => {
		const F = ABSORB_MERGE_FRACTION;
		const player = dot({ id: "p", kind: "player", x: 0, y: 0, radius: 20 });

		it("slides from where it was caught into the live player, shrinking, as it merges", () => {
			const caught = dot({ id: "c", x: 100, y: 100, radius: 10, absorb: F, prevAbsorb: F });
			const [c] = buildScene(frame([player, caught]), 0, PLAYER_POS);
			expect(c.kind).toBe("merging");
			expect(c.merge).toBe(1);
			expect(c).toMatchObject({ x: PLAYER_POS.x, y: PLAYER_POS.y });
			expect(c.radius).toBeLessThan(10);
			expect(c.radius).toBeGreaterThan(0);

			const [start] = buildScene(
				frame([player, dot({ id: "c", x: 100, y: 100, absorb: 0, prevAbsorb: 0 })]),
				0,
				PLAYER_POS,
			);
			expect(start).toMatchObject({ kind: "merging", x: 100, y: 100, radius: 10, merge: 0 });
		});

		it("interpolates the merge progress between ticks, and freezes it when paused", () => {
			const caught = dot({ id: "c", x: 100, y: 100, absorb: F, prevAbsorb: 0 });
			const [half] = buildScene(frame([player, caught]), 0.5, PLAYER_POS);
			expect(half.merge).toBeCloseTo(mergeSlide(F / 2));
			const [paused] = buildScene(frame([player, caught], "PAUSED"), 0.5, PLAYER_POS);
			expect(paused.merge).toBe(1);
		});

		it("swells the player by the volume it takes in, then settles back", () => {
			const radiusAt = (absorb: number) =>
				buildScene(
					frame([player, dot({ id: "c", radius: 20, prevRadius: 20, absorb, prevAbsorb: absorb })]),
					0,
					PLAYER_POS,
				)[1].radius;
			expect(radiusAt(0)).toBe(20);
			expect(radiusAt(F)).toBeCloseTo(20 * MERGE_SWELL_MAX);
			expect(radiusAt((F + 1) / 2)).toBeGreaterThan(20);
			expect(radiusAt((F + 1) / 2)).toBeLessThan(20 * MERGE_SWELL_MAX);
			expect(radiusAt(1)).toBeCloseTo(20);
		});

		it("caps the swell with several dots arriving at once", () => {
			const arriving = [0, 1, 2].map((i) =>
				dot({ id: `c${i}`, radius: 20, prevRadius: 20, absorb: F, prevAbsorb: F }),
			);
			const scene = buildScene(frame([player, ...arriving]), 0, PLAYER_POS);
			expect(scene[3].radius).toBeCloseTo(20 * MERGE_SWELL_MAX);
		});
	});

	describe("merge curves", () => {
		it("the slide eases in from 0 at catch to 1 at the end of the merge phase", () => {
			expect(mergeSlide(0)).toBe(0);
			expect(mergeSlide(ABSORB_MERGE_FRACTION)).toBe(1);
			expect(mergeSlide(1)).toBe(1);
			const early = mergeSlide(ABSORB_MERGE_FRACTION * 0.25);
			const late =
				mergeSlide(ABSORB_MERGE_FRACTION * 0.75) - mergeSlide(ABSORB_MERGE_FRACTION * 0.5);
			expect(late).toBeGreaterThan(early);
		});

		it("the swell peaks when the dot arrives and is gone by the end of the absorb", () => {
			expect(mergeSwell(0)).toBe(0);
			expect(mergeSwell(ABSORB_MERGE_FRACTION / 2)).toBe(0);
			expect(mergeSwell(ABSORB_MERGE_FRACTION)).toBe(1);
			expect(mergeSwell(1)).toBe(0);
			let previous = 1;
			for (let a = ABSORB_MERGE_FRACTION; a <= 1; a += 0.05) {
				expect(mergeSwell(a)).toBeLessThanOrEqual(previous);
				previous = mergeSwell(a);
			}
		});
	});
});
