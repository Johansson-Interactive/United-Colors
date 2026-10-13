import {
	createSceneBuilder,
	SCENE_RADIUS,
	SCENE_STRIDE,
	SCENE_X,
	SCENE_Y,
} from "../../application/renderScene";
import { POINT_DOT_VALUE } from "../../domain/constants";
import { GameEngine } from "../../domain/engine/GameEngine";
import type { Dot } from "../../domain/entities/Dot";
import { PointDot } from "../../domain/entities/PointDot";
import { SmallDot } from "../../domain/entities/SmallDot";
import type { Circle, RenderFrame } from "../../domain/types";

const ALPHA = 0.5;
/** How far either side of the drawn edge the player is set to probe the catch, px */
const GAP = 0.01;

/**
 * A game run to the first tick of a drip of the player's colour, where its size changes most
 * from one tick to the next
 */
function engineAtDrip() {
	let n = 0;
	const engine = new GameEngine({
		density: 100,
		screen: { width: 4000, height: 8000 },
		random: () => ((++n * 9301 + 49297) % 233280) / 233280,
	});
	engine.startGame();
	for (let i = 0; i < 5000; i++) {
		const frame = engine.getFrame();
		const player = frame.dots.find((d) => d.kind === "player");
		const drip = frame.dots.find(
			(d) => d.drip && d.color === player?.color && d.drip.prev === 0 && d.drip.progress > 0,
		);
		if (drip && player && frame.phase === "RUNNING") return { engine, frame, drip, player };
		engine.tick();
	}
	throw new Error("no drip");
}

describe("a drip between ticks", () => {
	const { frame, drip, player } = engineAtDrip();
	const others = frame.dots.filter((d) => d.kind !== "player");
	const scene = createSceneBuilder()(frame, ALPHA, player);
	const at = others.indexOf(drip) * SCENE_STRIDE;
	const drawn = {
		x: scene[at + SCENE_X],
		y: scene[at + SCENE_Y],
		radius: scene[at + SCENE_RADIUS],
	};
	const wall = drip.drip?.wall ?? { nx: 1, ny: 0 };
	// Straight out from the wall, and slanting either way along it, little enough that the
	// player is still clear of the wall
	const directions = [0, 10, -10].map((degrees) => {
		const cos = Math.cos((degrees * Math.PI) / 180);
		const sin = Math.sin((degrees * Math.PI) / 180);
		return { x: wall.nx * cos - wall.ny * sin, y: wall.ny * cos + wall.nx * sin };
	});

	/** Whether the player, set `gap` px clear of the drawn drip along `dir`, catches it mid-tick */
	function catches(dir: { x: number; y: number }, gap: number): boolean {
		const { engine } = engineAtDrip();
		const reach = player.radius + drawn.radius + gap;
		const target = { x: drawn.x + dir.x * reach, y: drawn.y + dir.y * reach };
		engine.onMovementDelta(target.x - player.x, target.y - player.y);
		engine.advancePlayer(0, ALPHA);
		// Not held back by the wall, or the probe would miss
		const reached = engine.getPlayerPosition();
		expect(Math.hypot(reached.x - target.x, reached.y - target.y)).toBeLessThan(GAP / 100);
		return engine.getFrame().dots.find((d) => d.id === drip.id)?.absorb !== undefined;
	}

	it("is drawn partway between its last two ticks", () => {
		// Well clear of the probes' margin either side of its edge
		expect(drip.radius - drawn.radius).toBeGreaterThan(5 * GAP);
	});

	it.each(directions)("is caught exactly where it is drawn, probed from %o", (dir) => {
		expect(catches(dir, -GAP)).toBe(true);
		expect(catches(dir, GAP)).toBe(false);
	});
});

/**
 * The circle `dot` is drawn at `alpha` of a tick on, and the one it is caught at, with the
 * player far away so nothing leans toward them. Its view is built as the engine builds it.
 */
function drawnAndCaught(dot: Dot, alpha: number) {
	const view = {
		id: dot.id,
		x: dot.x,
		y: dot.y,
		radius: dot.size / 2,
		prevRadius: dot.prevSize / 2,
		color: dot.color,
		kind: dot.kind,
		vx: dot.vx * dot.velocity,
		vy: dot.vy * dot.velocity,
		...(dot instanceof SmallDot ? dot.contact() : {}),
	};
	const frame: RenderFrame = { phase: "RUNNING", score: 0, dots: [view], events: [] };
	const scene = createSceneBuilder()(frame, alpha, { x: 5000, y: 5000 });
	const drawn = { x: scene[SCENE_X], y: scene[SCENE_Y], radius: scene[SCENE_RADIUS] };
	return { drawn, caught: dot.circleAt(alpha, { x: 0, y: 0, radius: 0 }) };
}

function expectSameCircle(drawn: Circle, caught: Circle) {
	expect(drawn.x).toBeCloseTo(caught.x, 4);
	expect(drawn.y).toBeCloseTo(caught.y, 4);
	expect(drawn.radius).toBeCloseTo(caught.radius, 4);
}

describe("a dot's collision circle at a mid-tick alpha", () => {
	const heading = { vx: 0.6, vy: 0.8 };

	it("is the circle a forming drip is drawn at", () => {
		const dot = new SmallDot("d", 1, 0, { x: 0, y: 300 }, heading, "#E91E63", 40, 2, 10);
		// Its first tick, where its size changes most
		dot.beginTick();
		dot.update(1);
		const { drawn, caught } = drawnAndCaught(dot, ALPHA);
		// Well apart from where it is at the tick, so a match is not by chance
		expect(dot.size / 2 - caught.radius).toBeGreaterThan(1);
		expectSameCircle(drawn, caught);
	});

	it("is the circle a drip is drawn at on the tick it grows full and shoots off", () => {
		const dot = new SmallDot("d", 1, 0, { x: 0, y: 300 }, heading, "#E91E63", 40, 2, 3);
		for (let t = 1; t <= 3; t++) {
			dot.beginTick();
			dot.update(t);
		}
		expect(dot.isDrifting).toBe(true);
		const { drawn, caught } = drawnAndCaught(dot, ALPHA);
		expect(dot.size / 2 - caught.radius).toBeGreaterThan(1);
		expectSameCircle(drawn, caught);
	});

	it("is the circle a point dot is drawn at while it changes size", () => {
		const dot = new PointDot("p", 0, 300, 300, "#E91E63", 40, POINT_DOT_VALUE);
		dot.beginTick();
		dot.update(1);
		const { drawn, caught } = drawnAndCaught(dot, ALPHA);
		expect(dot.size / 2 - caught.radius).toBeGreaterThan(0.1);
		expectSameCircle(drawn, caught);
	});
});
