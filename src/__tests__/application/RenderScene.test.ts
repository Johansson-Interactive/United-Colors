import { JELLY_MAX_STRETCH } from "../../application/jelly";
import { LEAN_GAP_SHARE, LEAN_RANGE, leanReach } from "../../application/lean";
import {
	REJECT_PRESS_DEPTH,
	REJECT_PRESS_END,
	REJECT_SPIT_GAP,
	REJECT_SQUASH,
	rejectPenetration,
} from "../../application/rejection";
import {
	addStretches,
	createSceneBuilder,
	MERGE_MAX_DOTS,
	MERGE_SWELL_MAX,
	mergeSlide,
	mergeSwell,
	YOLK_PULL,
	YOLK_RADIUS,
} from "../../application/renderScene";
import {
	findPlayer,
	readDot,
	readScene,
	sceneDot,
	sceneLength,
} from "../../application/sceneRecord";
import {
	DRIP_NECK,
	DRIP_STRETCH,
	launchStretch,
	PLAYER_NECK,
	PLAYER_PRESS,
	PLAYER_PUSH_SPEED,
	pressDepth,
	pressedRadius,
} from "../../application/wall";
import { ABSORB_MERGE_FRACTION, GAME_COLORS } from "../../domain/constants";
import { dripHang, dripOffset, dripRadius } from "../../domain/engine/Drip";
import type { DotView, GamePhase, RenderFrame, WallContact } from "../../domain/types";

const NO_WALLS = { wallX: 0, wallY: 0, wallC: 0, wall2X: 0, wall2Y: 0, wall2C: 0 };

function buildScene(f: RenderFrame, alpha: number, player: { x: number; y: number }) {
	return readScene(createSceneBuilder()(f, alpha, player));
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
	return { phase, score: 0, dots, events: [] };
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

	it("draws the player at its live position", () => {
		const scene = buildScene(
			frame([dot({ kind: "player", x: 0, y: 0, radius: 25, color: "#2196F3" }), dot({ id: "s" })]),
			0.5,
			PLAYER_POS,
		);
		expect(scene).toHaveLength(2);
		expect(scene.find((d) => d.kind === "player")).toEqual({
			...sceneDot(),
			x: 50,
			y: 60,
			radius: 25,
			color: GAME_COLORS.indexOf("#2196F3"),
			kind: "player",
		});
	});

	it("gives only the moving player a liquid stretch, and none while frozen", () => {
		const build = createSceneBuilder();
		const player = dot({ kind: "player", radius: 25 });
		const free = dot({});
		const shapeOf = (scene: Float32Array, index: number) => {
			const { stretchX, stretchY, wobble } = readDot(scene, index, sceneDot());
			return { stretchX, stretchY, wobble };
		};
		let scene = build(frame([free, player]), 0, { x: 50, y: 60 }, 16);
		for (let i = 1; i <= 30; i++)
			scene = build(frame([free, player]), 0, { x: 50 + 10 * i, y: 60 }, 16);
		const moving = shapeOf(scene, findPlayer(scene));
		expect(Math.abs(moving.stretchX)).toBeGreaterThan(0);
		expect(moving.wobble).toBeGreaterThan(0);
		expect(shapeOf(scene, 0)).toEqual({ stretchX: 0, stretchY: 0, wobble: 0 });

		const paused = build(frame([free, player], "PAUSED"), 0, { x: 400, y: 60 }, 16);
		expect(shapeOf(paused, findPlayer(paused))).toEqual(moving);
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
			[2, "point"],
			[1, "small"],
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
		expect(second).toHaveLength(sceneLength(2));
	});

	it("grows the buffer when the dot count no longer fits", () => {
		const build = createSceneBuilder();
		build(frame([dot({})]), 0, PLAYER_POS);
		const scene = build(frame([dot({}), dot({}), dot({ kind: "player" })]), 0, PLAYER_POS);
		expect(readScene(scene)).toHaveLength(3);
		expect(readScene(scene)[2]).toMatchObject({ x: 50, y: 60, kind: "player" });
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

		describe("with more dots merging than the liquid body holds", () => {
			// Small enough that the swell stays under its cap, so every dot shows in it
			const merging = (i: number, absorb: number) =>
				dot({ id: `c${i}`, x: 100 + i, radius: 4, prevRadius: 4, absorb, prevAbsorb: absorb });
			const playerRadius = (scene: ReturnType<typeof buildScene>) =>
				scene.find((d) => d.kind === "player")?.radius;

			it("draws only as many as the body holds, and swells only for those", () => {
				const many = Array.from({ length: MERGE_MAX_DOTS + 2 }, (_, i) => merging(i, F));
				const scene = buildScene(frame([player, ...many]), 0, PLAYER_POS);
				expect(scene.filter((d) => d.kind === "merging")).toHaveLength(MERGE_MAX_DOTS);

				const held = buildScene(frame([player, ...many.slice(0, MERGE_MAX_DOTS)]), 0, PLAYER_POS);
				expect(playerRadius(scene)).toBeCloseTo(playerRadius(held) ?? 0);
				expect(playerRadius(held)).toBeLessThan(20 * MERGE_SWELL_MAX);
			});

			it("leaves out the dots caught last, so none vanishes mid-slide", () => {
				const many = Array.from({ length: MERGE_MAX_DOTS }, (_, i) => merging(i, F / 2));
				const scene = buildScene(frame([merging(99, 0), player, ...many]), 0, PLAYER_POS);
				const drawn = scene.filter((d) => d.kind === "merging");
				expect(drawn).toHaveLength(MERGE_MAX_DOTS);
				expect(drawn.every((d) => d.merge > 0)).toBe(true);
			});

			it("draws them all once there is room", () => {
				const few = Array.from({ length: MERGE_MAX_DOTS }, (_, i) => merging(i, F));
				const scene = buildScene(frame([player, ...few]), 0, PLAYER_POS);
				expect(scene.filter((d) => d.kind === "merging")).toHaveLength(MERGE_MAX_DOTS);
			});
		});
	});

	describe("a point dot", () => {
		const player = dot({ id: "p", kind: "player", radius: 20, color: GAME_COLORS[0] });
		const point = (x: number, partial: Partial<DotView> = {}) =>
			dot({ id: "pt", kind: "point", x, y: 60, radius: 10, color: GAME_COLORS[1], ...partial });
		const drawn = (x: number, partial?: Partial<DotView>) =>
			buildScene(frame([point(x, partial), player]), 0, PLAYER_POS)[0];

		it("has a shell in the player's colour round a yolk in the colour it turns them into", () => {
			expect(drawn(400)).toMatchObject({ color: 0, core: 1 });
		});

		it("keeps its own colour and no yolk once caught, or with no player to match", () => {
			const caught = drawn(80, { absorb: 0.1, prevAbsorb: 0.1 });
			expect(caught).toMatchObject({ kind: "merging", color: 1, core: -1 });
			const [alone] = buildScene(frame([point(400)], "KIOSK"), 0, PLAYER_POS);
			expect(alone).toMatchObject({ color: 1, core: -1 });
		});

		it("is the only dot with a yolk", () => {
			const scene = buildScene(frame([dot({}), point(400), player]), 0, PLAYER_POS);
			expect(scene.map((d) => d.core)).toEqual([-1, 1, -1]);
		});

		it("sits round and still while the player is out of range", () => {
			const far = 50 + 20 + 10 + LEAN_RANGE * 20 + 1;
			expect(drawn(far)).toMatchObject({ x: far, y: 60, stretchX: 0, stretchY: 0 });
		});

		it("draws its yolk to the player from the start, wherever they are", () => {
			const pull = 10 * (1 - YOLK_RADIUS) * YOLK_PULL;
			// Far off to the right of the player, then far below it
			const right = drawn(1000);
			expect(right.coreX).toBeCloseTo(-pull);
			expect(right.coreY).toBeCloseTo(0);
			const [below] = buildScene(
				frame([dot({ kind: "point", x: 50, y: 1000, radius: 10 }), player]),
				0,
				PLAYER_POS,
			);
			expect(below.coreX).toBeCloseTo(0);
			expect(below.coreY).toBeCloseTo(-pull);
			// Still inside the shell
			expect(pull + 10 * YOLK_RADIUS).toBeLessThan(10);
		});

		it("has no yolk to pull once caught, and small dots have none", () => {
			expect(drawn(80, { absorb: 0.1, prevAbsorb: 0.1 })).toMatchObject({ coreX: 0, coreY: 0 });
			const [small] = buildScene(frame([dot({ x: 1000 }), player]), 0, PLAYER_POS);
			expect(small).toMatchObject({ coreX: 0, coreY: 0 });
		});

		it("leans toward a nearby player with its back edge held still", () => {
			// 30 px between the surfaces, the player to the left
			const d = drawn(110);
			const reach = leanReach(30, 20, 10);
			expect(reach).toBeGreaterThan(0);
			expect(d.stretchX).toBeCloseTo(-reach / 20);
			expect(d.stretchY).toBeCloseTo(0);
			const halfLength = 10 * (1 + Math.abs(d.stretchX));
			expect(d.x + halfLength).toBeCloseTo(110 + 10);
			expect(d.x - halfLength).toBeCloseTo(110 - 10 - reach);
		});

		it("never reaches the player before it is caught", () => {
			for (let x = 81; x < 200; x += 1) {
				const d = drawn(x);
				const tip = d.x - 10 * (1 + Math.abs(d.stretchX));
				const gap = x - 10 - (50 + 20);
				expect(tip - (50 + 20)).toBeGreaterThanOrEqual(gap * (1 - LEAN_GAP_SHARE) - 1e-3);
			}
		});

		it("does not lean while it is caught", () => {
			expect(drawn(80, { absorb: 0.1, prevAbsorb: 0.1 })).toMatchObject({
				stretchX: 0,
				stretchY: 0,
			});
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

	describe("a refused dot", () => {
		const player = dot({ id: "p", kind: "player", radius: 20 });
		// Touching the player at (50, 60), 1 px into it from the right
		const refused = (reject: number, prevReject = reject) =>
			dot({ id: "r", x: 79, y: 60, radius: 10, prevRadius: 10, reject, prevReject });
		const at = (reject: number, phase: GamePhase = "REJECTING") => {
			const scene = createSceneBuilder()(frame([player, refused(reject)], phase), 0, PLAYER_POS);
			return {
				dot: readScene(scene).find((d) => d.kind === "rejected"),
				player: readDot(scene, findPlayer(scene), sceneDot()),
			};
		};

		it("sinks into the player along the hit, denting it, as the player squashes", () => {
			const touch = at(0);
			expect(touch.dot).toMatchObject({ x: 79, y: 60, dent: 1 });
			const pressed = at(REJECT_PRESS_END);
			// Half its radius into the player
			expect(pressed.dot?.x).toBeCloseTo(50 + 20 + 10 - 10 * REJECT_PRESS_DEPTH);
			expect(pressed.dot?.y).toBeCloseTo(60);
			expect(pressed.dot?.dent).toBe(1);
			// Squashed along the hit, so long across it
			expect(pressed.player.stretchX).toBeCloseTo(0);
			expect(Math.abs(pressed.player.stretchY)).toBeCloseTo(REJECT_SQUASH);
			expect(pressed.player).toMatchObject({ x: 50, y: 60, dent: 0 });
		});

		it("is pushed back out and clear while the player recoils, leaving no dent", () => {
			const pushing = at(0.7);
			expect(pushing.dot?.x).toBeGreaterThan(75);
			expect(pushing.player?.x).toBeLessThan(50);
			expect(pushing.dot?.dent).toBeLessThan(1);
			const done = at(1);
			expect(done.dot?.x).toBeCloseTo(50 + 20 + 10 * (1 + REJECT_SPIT_GAP));
			expect(done.dot?.dent).toBe(0);
			expect(done.player?.x).toBeCloseTo(50);
			expect(done.player).toMatchObject({ stretchX: 0, stretchY: 0 });
		});

		it("is drawn exactly pushed out on the game over screen", () => {
			expect(at(1, "GAME_OVER")).toEqual(at(1));
		});

		it("interpolates the refusal between ticks", () => {
			const scene = buildScene(frame([player, refused(0.2, 0.1)]), 0.5, PLAYER_POS);
			const depth = rejectPenetration(0.15, 1, 10);
			expect(scene.find((d) => d.kind === "rejected")?.x).toBeCloseTo(80 - depth);
		});
	});
});

describe("at the walls", () => {
	const LEFT: WallContact = { nx: 1, ny: 0, x: 0, y: 100 };
	const BOTTOM: WallContact = { nx: 0, ny: -1, x: 100, y: 800 };

	describe("a drip", () => {
		/** A drip heading straight out of its wall unless given a heading */
		const forming = (
			progress: number,
			prev = progress,
			wall = LEFT,
			heading = { vx: wall.nx, vy: wall.ny },
		) =>
			dot({
				x: 1,
				y: 100,
				radius: 1,
				prevRadius: 1,
				drip: { wall, progress, prev, radius: 10, heading },
			});

		it("is drawn where it hangs from its wall at its interpolated size, with a fillet to the wall", () => {
			const [d] = buildScene(frame([forming(0.4)], "KIOSK"), 0, PLAYER_POS);
			const grown = 10 * dripRadius(0.4);
			expect(d.radius).toBeCloseTo(grown);
			expect(d.x).toBeCloseTo(grown * dripHang(0.4));
			expect(d.y).toBe(100);
			expect(d.kind).toBe("small");
			expect(d).toMatchObject({ ...NO_WALLS, wallX: 1, wallY: 0, wallC: 0 });
			expect(d.neck).toBeCloseTo(10 * DRIP_NECK);
			const [below] = buildScene(frame([forming(0.4, 0.4, BOTTOM)], "KIOSK"), 0, PLAYER_POS);
			expect(below.x).toBe(100);
			expect(below.y).toBeCloseTo(800 - grown * dripHang(0.4));
			expect(below).toMatchObject({ wallX: 0, wallY: -1, wallC: -800 });
		});

		it("swells forward and is drawn out along the heading it will shoot off on", () => {
			const heading = { vx: 0.6, vy: 0.8 };
			const [d] = buildScene(frame([forming(0.7, 0.7, LEFT, heading)], "KIOSK"), 0, PLAYER_POS);
			const grown = 10 * dripRadius(0.7);
			const at = dripOffset(0.7, 1, 0, 0.6, 0.8);
			expect(d.x).toBeCloseTo(at.x * grown);
			expect(d.y).toBeCloseTo(100 + at.y * grown);
			expect(d.y).toBeGreaterThan(100);
			expect(d.stretchX).toBeCloseTo(0.6 * DRIP_STRETCH);
			expect(d.stretchY).toBeCloseTo(0.8 * DRIP_STRETCH);
			expect(d).toMatchObject({ wallX: 1, wallY: 0, wallC: 0 });
		});

		it("grows between ticks, and holds still when frozen", () => {
			const [half] = buildScene(frame([forming(0.5, 0.3)], "KIOSK"), 0.5, PLAYER_POS);
			expect(half.radius).toBeCloseTo(10 * dripRadius(0.4));
			const [paused] = buildScene(frame([forming(0.5, 0.3)], "PAUSED"), 0.5, PLAYER_POS);
			expect(paused.radius).toBeCloseTo(10 * dripRadius(0.5));
		});

		it("is nothing at first", () => {
			const [d] = buildScene(frame([forming(0)], "KIOSK"), 0, PLAYER_POS);
			expect(d.radius).toBe(0);
		});
	});

	describe("a launched drip", () => {
		const launched = (progress: number, prev = progress) =>
			dot({ x: 30, y: 100, vx: 6, vy: 8, launch: { wall: LEFT, progress, prev } });

		it("is drawn out along its heading, still joined to the wall by the fillet", () => {
			const [d] = buildScene(frame([launched(0.5)], "KIOSK"), 0, PLAYER_POS);
			expect(d).toMatchObject({ x: 30, y: 100, radius: 10, neck: 10 * DRIP_NECK });
			expect(d).toMatchObject({ wallX: 1, wallY: 0, wallC: 0 });
			expect(Math.hypot(d.stretchX, d.stretchY)).toBeCloseTo(launchStretch(0.5));
			expect(d.stretchX / d.stretchY).toBeCloseTo(6 / 8);
		});

		it("moves on between ticks as the launch eases, and is round again by the end", () => {
			const [moving] = buildScene(frame([launched(0.5, 0.25)], "KIOSK"), 0.5, PLAYER_POS);
			expect(moving).toMatchObject({ x: 33, y: 104 });
			expect(Math.hypot(moving.stretchX, moving.stretchY)).toBeCloseTo(launchStretch(0.375));
			const [done] = buildScene(frame([launched(1)], "KIOSK"), 0, PLAYER_POS);
			expect(done).toMatchObject({ stretchX: 0, stretchY: 0 });
		});

		it("is drawn out straight off the wall when a frozen frame reports no heading", () => {
			const still = dot({ x: 30, y: 100, launch: { wall: LEFT, progress: 0.5, prev: 0.5 } });
			const [d] = buildScene(frame([still], "GAME_OVER"), 0, PLAYER_POS);
			expect(d.stretchX).toBeCloseTo(launchStretch(0.5));
			expect(d.stretchY).toBe(0);
		});
	});

	describe("the player pushed into a wall", () => {
		const SCREEN = { width: 400, height: 800 };
		const player = dot({ id: "p", kind: "player", radius: 20 });
		const FLUSH_LEFT = { x: 20, y: 300 };
		/** Frames of the player at `at` pushing `push` px/s, until the press has settled */
		function settled(
			build: ReturnType<typeof createSceneBuilder>,
			push: { x: number; y: number },
			at = FLUSH_LEFT,
		) {
			let scene: Float32Array = new Float32Array(0);
			for (let i = 0; i < 60; i++) {
				scene = build(frame([player]), 0, { ...at, pushX: push.x, pushY: push.y }, 16, SCREEN);
			}
			return readScene(scene)[0];
		}

		it("presses into the wall as hard as it pushes, widening and wetting it", () => {
			const p = settled(createSceneBuilder(), { x: -PLAYER_PUSH_SPEED, y: 0 });
			const depth = pressDepth(PLAYER_PUSH_SPEED, 20);
			expect(p.x).toBeCloseTo(20 - depth, 1);
			expect(p.y).toBe(300);
			expect(p.radius).toBeCloseTo(pressedRadius(20, depth), 1);
			expect(p).toMatchObject({ ...NO_WALLS, wallX: 1, wallY: 0, wallC: 0 });
			expect(p.neck).toBeCloseTo(20 * PLAYER_NECK * (depth / (20 * PLAYER_PRESS)), 1);
			const harder = settled(createSceneBuilder(), { x: -10 * PLAYER_PUSH_SPEED, y: 0 });
			expect(harder.x).toBeLessThan(p.x);
			expect(20 - harder.x).toBeLessThanOrEqual(20 * PLAYER_PRESS);
		});

		it("presses into each wall it is pushed toward, two in a corner", () => {
			const corner = settled(createSceneBuilder(), { x: 300, y: 300 }, { x: 380, y: 780 });
			expect(corner).toMatchObject({ wallX: -1, wallY: 0, wallC: -400 });
			expect(corner).toMatchObject({ wall2X: 0, wall2Y: -1, wall2C: -800 });
			expect(corner.x).toBeGreaterThan(380);
			expect(corner.y).toBeGreaterThan(780);
			const top = settled(createSceneBuilder(), { x: 0, y: -300 }, { x: 200, y: 20 });
			expect(top).toMatchObject({ wallX: 0, wallY: 1, wallC: 0 });
			expect(top.y).toBeLessThan(20);
		});

		it("presses into a rounded corner's curve alone, at its slant where it meets it", () => {
			const rounded = { ...SCREEN, corners: { radius: 60, curve: "circular" as const } };
			// Resting on the arc round (60, 60), on the diagonal
			const rest = 60 - 40 * Math.SQRT1_2;
			const build = createSceneBuilder();
			let scene: Float32Array = new Float32Array(0);
			for (let i = 0; i < 60; i++) {
				scene = build(
					frame([player]),
					0,
					{ x: rest, y: rest, pushX: -300, pushY: -300 },
					16,
					rounded,
				);
			}
			const p = readScene(scene)[0];
			expect(p.wallX).toBeCloseTo(Math.SQRT1_2, 2);
			expect(p.wallY).toBeCloseTo(Math.SQRT1_2, 2);
			expect(p).toMatchObject({ wall2X: 0, wall2Y: 0, wall2C: 0 });
			expect(p.x).toBeLessThan(rest);
			expect(p.x).toBeCloseTo(p.y, 2);
		});

		it("follows the push with a short lag rather than at once", () => {
			const build = createSceneBuilder();
			build(frame([player]), 0, FLUSH_LEFT, 16, SCREEN);
			const first = readScene(
				build(frame([player]), 0, { ...FLUSH_LEFT, pushX: -300 }, 16, SCREEN),
			)[0];
			expect(first.x).toBeLessThan(20);
			expect(first.x).toBeGreaterThan(20 - pressDepth(300, 20));
		});

		it("eases back as the push lets up, and at once by any gap that opens as it pulls away", () => {
			const build = createSceneBuilder();
			settled(build, { x: -300, y: 0 });
			const letUp = readScene(build(frame([player]), 0, FLUSH_LEFT, 16, SCREEN))[0];
			expect(letUp.x).toBeLessThan(20);
			expect(letUp).toMatchObject({ wallX: 1, wallY: 0, wallC: 0 });
			for (let i = 0; i < 60; i++) build(frame([player]), 0, FLUSH_LEFT, 16, SCREEN);
			const gone = readScene(build(frame([player]), 0, FLUSH_LEFT, 16, SCREEN))[0];
			expect(gone).toMatchObject({ x: 20, radius: 20, ...NO_WALLS, neck: 0 });

			settled(build, { x: -300, y: 0 });
			const depth = pressDepth(300, 20);
			const pulled = readScene(
				build(frame([player]), 0, { x: 20 + depth / 2, y: 300 }, 16, SCREEN),
			)[0];
			expect(20 + depth / 2 - pulled.x).toBeLessThan(depth / 2 + 1e-6);
			const clear = readScene(build(frame([player]), 0, { x: 20 + depth, y: 300 }, 16, SCREEN))[0];
			expect(clear.x).toBeCloseTo(20 + depth);
			expect(clear).toMatchObject(NO_WALLS);
		});

		it("needs the screen to know where the walls are", () => {
			const build = createSceneBuilder();
			let scene: Float32Array = new Float32Array(0);
			for (let i = 0; i < 60; i++) {
				scene = build(frame([player]), 0, { ...FLUSH_LEFT, pushX: -300, pushY: 0 }, 16);
			}
			expect(readScene(scene)[0]).toMatchObject({ x: 20, ...NO_WALLS, neck: 0 });
		});

		it("holds the press while frozen", () => {
			const build = createSceneBuilder();
			const pressed = settled(build, { x: -300, y: 0 });
			const paused = readScene(build(frame([player], "PAUSED"), 0, FLUSH_LEFT, 0, SCREEN))[0];
			expect(paused.x).toBeCloseTo(pressed.x);
			expect(paused).toMatchObject({
				wallX: pressed.wallX,
				wallY: pressed.wallY,
				wallC: pressed.wallC,
			});
		});

		it("keeps its slosh on its own path, not the press", () => {
			// Pressed in and out again, the jelly saw no motion: the drop stays round
			const build = createSceneBuilder();
			settled(build, { x: -300, y: 0 });
			for (let i = 0; i < 60; i++) build(frame([player]), 0, FLUSH_LEFT, 16, SCREEN);
			const p = readScene(build(frame([player]), 0, FLUSH_LEFT, 16, SCREEN))[0];
			expect(p).toMatchObject({ stretchX: 0, stretchY: 0 });
		});
	});
});

describe("addStretches", () => {
	it("adds stretches along one axis, whichever way they point", () => {
		const [x, y] = addStretches(0.05, 0, -0.03, 0);
		expect(Math.abs(x)).toBeCloseTo(0.08);
		expect(y).toBeCloseTo(0);
	});

	it("cancels stretches at right angles instead of turning the axis", () => {
		const [x, y] = addStretches(0.05, 0, 0, 0.05);
		expect(Math.hypot(x, y)).toBeCloseTo(0);
	});

	it("caps the result at the most the shader allows for", () => {
		const [x, y] = addStretches(JELLY_MAX_STRETCH, 0, JELLY_MAX_STRETCH, 0);
		expect(Math.hypot(x, y)).toBeCloseTo(JELLY_MAX_STRETCH);
	});
});
