import {
	createSceneBuilder,
	SCENE_COLOR,
	SCENE_KIND,
	SCENE_KIND_PLAYER,
	SCENE_KIND_POINT,
	SCENE_KIND_SMALL,
	SCENE_RADIUS,
	SCENE_STRIDE,
	SCENE_X,
	SCENE_Y,
} from "../../application/renderScene";
import { GAME_COLORS } from "../../domain/constants";
import type { DotView, GamePhase, RenderFrame } from "../../domain/types";

const KIND_NAMES = {
	[SCENE_KIND_SMALL]: "small",
	[SCENE_KIND_POINT]: "point",
	[SCENE_KIND_PLAYER]: "player",
} as Record<number, DotView["kind"]>;

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
		expect(scene[1]).toEqual({ x: 50, y: 60, radius: 25, color: "#2196F3", kind: "player" });
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
});
