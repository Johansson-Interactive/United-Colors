import { buildScene } from "../../application/renderScene";
import type { DotView, GamePhase, RenderFrame } from "../../domain/types";

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
});
