import { arenaContacts, cornerExtent, holdInside } from "../../domain/arena";
import {
	DOT_LIMIT,
	GAME_COLORS,
	GAME_HERTZ,
	KIOSK_DOT_LIMIT,
	POINT_DOT_SIZE_RATIO,
	POINT_DOT_TIME_BETWEEN,
	SMALL_DOT_CREATE_INTERVAL,
	SMALL_DOT_HEADING_SPREAD,
	SMALL_DOT_MIN_GROW_TICKS,
	SMALL_DOT_RATE_GROWTH,
	SMALL_DOT_SIZE_RATIO,
} from "../../domain/constants";
import { SpawnSystem } from "../../domain/engine/SpawnSystem";
import { PlayerDot } from "../../domain/entities/PlayerDot";
import type { PointDot } from "../../domain/entities/PointDot";
import type { SmallDot } from "../../domain/entities/SmallDot";
import { seededRandom } from "../../domain/random";
import type { ScreenSize } from "../../domain/types";
import { PHONE_DENSITY, PHONES, PLAYER_SIZE, POINT_SIZE, ROUNDED_PHONES } from "./phones";

/** Ticks in a minute. One minute in, dots come 25 a minute: one every 72 ticks */
const MINUTE = GAME_HERTZ * 60;
/** So far into a run (200 minutes) that the spawn interval is under a tick */
const LATE = 200 * MINUTE;

/**
 * The next `count` point dots, each caught as soon as it spawns so the next follows after the
 * longest wait; `player` is asked where it is before each. Ticks count on from `after`.
 */
function pointDots(
	system: SpawnSystem,
	player: (index: number) => PlayerDot,
	screen: ScreenSize,
	count: number,
	after = 0,
): PointDot[] {
	const dots: PointDot[] = [];
	for (let call = 1; dots.length < count; call++) {
		const tick = after + call * 2 * POINT_DOT_TIME_BETWEEN;
		const dot = system.trySpawnPointDot(tick, player(dots.length), screen, PHONE_DENSITY);
		if (dot) {
			dots.push(dot);
			dot.startAbsorb();
		}
	}
	return dots;
}

/** The space between a grown point dot's edge and the player's, at a phone's density */
function gap(dot: PointDot, player: PlayerDot): number {
	return Math.hypot(dot.x - player.x, dot.y - player.y) - POINT_SIZE / 2 - player.size / 2;
}

/**
 * Nine spots the player can be on `screen`, at its centre, the middle of each edge and each
 * corner
 */
function centreEdgesAndCorners(screen: ScreenSize): { x: number; y: number }[] {
	const r = PLAYER_SIZE / 2;
	const xs = [r, screen.width / 2, screen.width - r];
	const ys = [r, screen.height / 2, screen.height - r];
	return xs.flatMap((x) => ys.map((y) => ({ x, y })));
}

/** Run a drip until it has shot off its wall */
function launched(dot: SmallDot): SmallDot {
	for (let t = 1; !dot.isDrifting && t < 10000; t++) dot.update(t);
	return dot;
}

describe("SpawnSystem", () => {
	let spawn: SpawnSystem;

	beforeEach(() => {
		spawn = new SpawnSystem(() => 0.5);
		spawn.reset();
	});

	describe("spawn wait time", () => {
		/** Dots a minute at this time step */
		const rate = (timeStep: number) => MINUTE / spawn.getSpawnWaitTime(timeStep, false);

		it("returns the full interval at time step 0", () => {
			expect(spawn.getSpawnWaitTime(0, false)).toBe(SMALL_DOT_CREATE_INTERVAL);
			expect(rate(0)).toBeCloseTo(15);
		});

		it("adds the same number of dots a minute with every minute played", () => {
			expect(rate(MINUTE)).toBeCloseTo(15 + SMALL_DOT_RATE_GROWTH);
			expect(spawn.getSpawnWaitTime(MINUTE, false)).toBeCloseTo(72);
			expect(rate(4.5 * MINUTE)).toBeCloseTo(60);
			for (let minute = 0; minute < 30; minute++) {
				expect(rate((minute + 1) * MINUTE) - rate(minute * MINUTE)).toBeCloseTo(
					SMALL_DOT_RATE_GROWTH,
				);
			}
		});

		it("has no wall at four minutes, where the legacy interval ran down to 0", () => {
			expect(spawn.getSpawnWaitTime(4 * MINUTE, false)).toBeGreaterThan(30);
			expect(rate(5 * MINUTE)).toBeCloseTo(65);
		});

		it("keeps shortening without limit", () => {
			let previous = spawn.getSpawnWaitTime(0, false);
			for (let step = MINUTE; step <= LATE; step += MINUTE) {
				const wait = spawn.getSpawnWaitTime(step, false);
				expect(wait).toBeLessThan(previous);
				expect(wait).toBeGreaterThan(0);
				previous = wait;
			}
			expect(spawn.getSpawnWaitTime(LATE, false)).toBeLessThan(1);
		});

		it("always returns the full interval in kiosk mode", () => {
			expect(spawn.getSpawnWaitTime(LATE, true)).toBe(SMALL_DOT_CREATE_INTERVAL);
		});
	});

	describe("drips", () => {
		const screen = { width: 400, height: 800 };

		it("a drip starts forming at once and takes the spawn wait to shoot off", () => {
			const drip = spawn.trySpawnSmallDot(1, 0, screen, 100, false);
			expect(drip).not.toBeNull();
			if (!drip) return;
			expect(drip.isForming).toBe(true);
			expect(drip.size).toBe(0);
			const grow = spawn.getDripGrowTicks(1, false);
			expect(grow).toBeGreaterThanOrEqual(SMALL_DOT_CREATE_INTERVAL);
			for (let t = 1; t < grow; t++) {
				drip.update(t);
				expect(drip.isForming).toBe(true);
			}
			drip.update(grow);
			expect(drip.isForming).toBe(false);
			expect(drip.size).toBe(SMALL_DOT_SIZE_RATIO * 100);
		});

		it("only one drip forms at a time, and the next starts once it has left the wall", () => {
			const drip = spawn.trySpawnSmallDot(1, 0, screen, 100, false);
			expect(spawn.trySpawnSmallDot(2, 1, screen, 100, false)).toBeNull();
			expect(spawn.trySpawnSmallDot(50, 1, screen, 100, false)).toBeNull();
			if (drip) launched(drip);
			const next = spawn.trySpawnSmallDot(51, 1, screen, 100, false);
			expect(next).not.toBeNull();
			expect(next).not.toBe(drip);
		});

		it("a drip the player plucks off the wall is replaced too", () => {
			const drip = spawn.trySpawnSmallDot(1, 0, screen, 100, false);
			drip?.startAbsorb();
			expect(spawn.trySpawnSmallDot(2, 1, screen, 100, false)).not.toBeNull();
		});

		it("forms faster as the difficulty rises, never faster than the floor", () => {
			expect(spawn.getDripGrowTicks(0, false)).toBe(SMALL_DOT_CREATE_INTERVAL + 1);
			expect(spawn.getDripGrowTicks(MINUTE, false)).toBe(72 + 1);
			expect(spawn.getDripGrowTicks(LATE, false)).toBe(SMALL_DOT_MIN_GROW_TICKS);
			expect(spawn.getDripGrowTicks(LATE, true)).toBe(SMALL_DOT_CREATE_INTERVAL + 1);
			const drip = spawn.trySpawnSmallDot(LATE, 0, screen, 100, false);
			let ticks = 0;
			while (drip?.isForming && ticks < 1000) drip.update(++ticks);
			expect(ticks).toBe(SMALL_DOT_MIN_GROW_TICKS);
		});

		it("past the floor the walls drip from more places at once, keeping the spawn rate", () => {
			expect(spawn.getDripCount(0, false)).toBe(1);
			expect(spawn.getDripCount(MINUTE, false)).toBe(1);
			// That late a dot is due every tick; the floor alone would let through one per
			// SMALL_DOT_MIN_GROW_TICKS
			expect(spawn.getDripCount(LATE, false)).toBe(SMALL_DOT_MIN_GROW_TICKS);
			expect(spawn.getDripCount(LATE, true)).toBe(1);
			for (let step = 0; step <= LATE; step += 100) {
				const period = Math.floor(spawn.getSpawnWaitTime(step, false)) + 1;
				const rate = spawn.getDripCount(step, false) / spawn.getDripGrowTicks(step, false);
				expect(rate).toBeGreaterThanOrEqual(1 / period / 1.4);
				expect(rate).toBeLessThanOrEqual((1 / period) * 1.4);
			}
			const system = new SpawnSystem(() => 0.5);
			let started = 0;
			for (let tick = 0; tick < SMALL_DOT_MIN_GROW_TICKS; tick++) {
				if (system.trySpawnSmallDot(LATE, started, screen, 100, false)) started++;
			}
			expect(started).toBe(SMALL_DOT_MIN_GROW_TICKS);
			expect(system.trySpawnSmallDot(LATE, started, screen, 100, false)).toBeNull();
		});

		it("does not exceed the kiosk or the overall dot limit", () => {
			expect(spawn.trySpawnSmallDot(1, KIOSK_DOT_LIMIT, screen, 100, true)).toBeNull();
			expect(spawn.trySpawnSmallDot(1, DOT_LIMIT, screen, 100, false)).toBeNull();
			expect(spawn.trySpawnSmallDot(1, KIOSK_DOT_LIMIT, screen, 100, false)).not.toBeNull();
		});

		it("forms on a wall, far enough along it to fit on it fully grown", () => {
			const size = SMALL_DOT_SIZE_RATIO * 100;
			for (const [side, along] of [
				[0, 0],
				[0, 1],
				[1, 0.5],
				[2, 0],
				[2, 1],
				[3, 0.5],
			]) {
				const rolls = [side / 4, along, 0.5, 0.5];
				const system = new SpawnSystem(() => rolls.shift() ?? 0.5);
				const drip = system.trySpawnSmallDot(1, 0, screen, 100, false);
				const wall = drip?.contact().drip?.wall;
				expect(wall).toBeDefined();
				if (!wall) continue;
				if (side === 0) expect(wall).toMatchObject({ nx: 1, ny: 0, x: 0 });
				if (side === 1) expect(wall).toMatchObject({ nx: -1, ny: 0, x: screen.width });
				if (side === 2) expect(wall).toMatchObject({ nx: 0, ny: 1, y: 0 });
				if (side === 3) expect(wall).toMatchObject({ nx: 0, ny: -1, y: screen.height });
				const alongAxis = wall.nx !== 0 ? wall.y : wall.x;
				const span = wall.nx !== 0 ? screen.height : screen.width;
				expect(alongAxis).toBeGreaterThanOrEqual(size / 2);
				expect(alongAxis).toBeLessThanOrEqual(span - size / 2);
			}
		});
	});

	describe("with rounded corners", () => {
		const rounded = {
			width: 400,
			height: 800,
			corners: { radius: 50, curve: "continuous" as const },
		};
		const extent = cornerExtent(rounded);

		it("drips form only on the straight part of each edge, clear of the curves", () => {
			const size = SMALL_DOT_SIZE_RATIO * 100;
			for (const side of [0, 1, 2, 3]) {
				for (const along of [0, 1]) {
					const rolls = [side / 4, along, 0.5, 0.5];
					const system = new SpawnSystem(() => rolls.shift() ?? 0.5);
					const wall = system.trySpawnSmallDot(1, 0, rounded, 100, false)?.contact().drip?.wall;
					if (!wall) throw new Error("no drip");
					const alongAxis = wall.nx !== 0 ? wall.y : wall.x;
					const span = wall.nx !== 0 ? rounded.height : rounded.width;
					expect(alongAxis).toBeCloseTo(along === 0 ? extent + size / 2 : span - extent - size / 2);
				}
			}
		});

		it("a point dot that would touch a corner's curve is pushed in off it, staying in the corner", () => {
			// Draws: timing, color, then the first cell (top left) and its top-left point
			const rolls = [0.5, 0.5, 0, 0, 0];
			const scripted = new SpawnSystem(() => rolls.shift() ?? 0.5);
			const farCorner = new PlayerDot(390, 790, GAME_COLORS[0], 12.5, 0);
			const dot = scripted.trySpawnPointDot(POINT_DOT_TIME_BETWEEN + 1, farCorner, rounded, 100);
			if (!dot) throw new Error("no point dot");
			expect(arenaContacts(rounded, dot.x, dot.y, (POINT_DOT_SIZE_RATIO * 100) / 2)).toEqual([]);
			expect(dot.x).toBeLessThan(extent);
			expect(dot.y).toBeLessThan(extent);
		});

		it("no point dot touches a corner's curve", () => {
			let seed = 1;
			for (const screen of ROUNDED_PHONES) {
				for (const spot of centreEdgesAndCorners(screen)) {
					const player = new PlayerDot(spot.x, spot.y, GAME_COLORS[0], PLAYER_SIZE, 0);
					const system = new SpawnSystem(seededRandom(seed++));
					for (const dot of pointDots(system, () => player, screen, 60)) {
						expect(arenaContacts(screen, dot.x, dot.y, POINT_SIZE / 2)).toEqual([]);
					}
				}
			}
		});
	});

	describe("point dot spawning", () => {
		const screen = { width: 400, height: 800 };
		// random() = 0.5 -> wait of POINT_DOT_TIME_BETWEEN (half + 0.5 * full)
		const wait = POINT_DOT_TIME_BETWEEN;
		// Corner player, away from where random() = 0.5 places the point dot
		const player = new PlayerDot(10, 10, "#E91E63", 12.5, 0);

		it("waits from when a point dot is caught (not when it finishes merging) before respawning", () => {
			const first = spawn.trySpawnPointDot(wait + 1, player, screen, 100);
			expect(first).not.toBeNull();

			// Alive until collected at step 1000
			expect(spawn.trySpawnPointDot(1000, player, screen, 100)).toBeNull();
			first?.startAbsorb();

			expect(spawn.trySpawnPointDot(1001, player, screen, 100)).toBeNull();
			expect(spawn.trySpawnPointDot(1000 + wait, player, screen, 100)).toBeNull();
			expect(spawn.trySpawnPointDot(1000 + wait + 1, player, screen, 100)).not.toBeNull();
		});

		it("picks its color from the weighted picker, not the player's color", () => {
			// Player is [0]; with a roll of 0.5 over [1] and [2] at equal weight -> [2]
			const dot = spawn.trySpawnPointDot(wait + 1, player, screen, 100);
			expect(dot?.color).toBe(GAME_COLORS[2]);
		});

		it("never spawns in the player's color", () => {
			for (const color of GAME_COLORS) {
				const system = new SpawnSystem(Math.random);
				system.reset();
				const p = new PlayerDot(10, 10, color, 12.5, 0);
				for (let i = 0; i < 50; i++) {
					const dot = system.trySpawnPointDot(wait * 2 * (i + 1), p, screen, 100);
					expect(dot?.color).not.toBe(color);
					dot?.startAbsorb();
				}
			}
		});

		it("is not affected by small dot colors", () => {
			// Spawn many small dots, then check the point dot still uses fresh 1/3 weights
			for (let i = 1; i <= 10; i++) {
				const drip = spawn.trySpawnSmallDot(i, 0, screen, 100, false);
				expect(drip).not.toBeNull();
				if (drip) launched(drip);
			}
			// random() = 0.5 with player [0] excluded -> [1] and [2] equal -> 0.5 picks [2]
			const dot = spawn.trySpawnPointDot(POINT_DOT_TIME_BETWEEN * 2, player, screen, 100);
			expect(dot?.color).toBe(GAME_COLORS[2]);
		});

		it("waits after a faded point dot is removed before respawning", () => {
			const first = spawn.trySpawnPointDot(wait + 1, player, screen, 100);
			let step = wait + 1;
			// Each tick the dot is still alive pushes the wait start forward
			for (;;) {
				first?.update(step + 1);
				if (first?.isFlaggedForRemoval) break;
				step++;
				expect(spawn.trySpawnPointDot(step, player, screen, 100)).toBeNull();
			}

			expect(spawn.trySpawnPointDot(step + wait, player, screen, 100)).toBeNull();
			expect(spawn.trySpawnPointDot(step + wait + 1, player, screen, 100)).not.toBeNull();
		});
	});

	describe("point dot placement", () => {
		/** Two player widths */
		const clearSpace = 2 * PLAYER_SIZE;

		it("keeps every point dot two player widths clear of the player, inside the spawn area", () => {
			let seed = 1;
			for (const screen of PHONES) {
				for (const spot of centreEdgesAndCorners(screen)) {
					const player = new PlayerDot(spot.x, spot.y, GAME_COLORS[0], PLAYER_SIZE, 0);
					const system = new SpawnSystem(seededRandom(seed++));
					for (const dot of pointDots(system, () => player, screen, 60)) {
						expect(gap(dot, player)).toBeGreaterThanOrEqual(clearSpace);
						expect(dot.x).toBeGreaterThanOrEqual(POINT_SIZE);
						expect(dot.x).toBeLessThanOrEqual(screen.width - POINT_SIZE);
						expect(dot.y).toBeGreaterThanOrEqual(POINT_SIZE);
						expect(dot.y).toBeLessThanOrEqual(screen.height - POINT_SIZE);
					}
				}
			}
		});

		it("keeps clear of where the player is when each point dot spawns", () => {
			const screen = PHONES[0];
			const spots = centreEdgesAndCorners(screen);
			const players = spots.map((at) => new PlayerDot(at.x, at.y, GAME_COLORS[0], PLAYER_SIZE, 0));
			const system = new SpawnSystem(seededRandom(7));
			const dots = pointDots(system, (i) => players[i % players.length], screen, 90);
			dots.forEach((dot, i) => {
				expect(gap(dot, players[i % players.length])).toBeGreaterThanOrEqual(clearSpace);
			});
		});

		it("keeps the clear space on phones with rounded corners, where dots are pushed off the curves", () => {
			let seed = 1;
			for (const screen of ROUNDED_PHONES) {
				// Where the player can be: a corner spot is held in off the curve, like the player
				const players = centreEdgesAndCorners(screen).map((spot) => {
					const at = holdInside(screen, spot.x, spot.y, PLAYER_SIZE / 2);
					return new PlayerDot(at.x, at.y, GAME_COLORS[0], PLAYER_SIZE, 0);
				});
				for (const player of players) {
					const system = new SpawnSystem(seededRandom(seed++));
					for (const dot of pointDots(system, () => player, screen, 60)) {
						expect(gap(dot, player)).toBeGreaterThanOrEqual(clearSpace);
					}
				}
				const moving = new SpawnSystem(seededRandom(seed++));
				const dots = pointDots(moving, (i) => players[i % players.length], screen, 90);
				dots.forEach((dot, i) => {
					expect(gap(dot, players[i % players.length])).toBeGreaterThanOrEqual(clearSpace);
				});
			}
		});
	});

	describe("point dot spawn memory", () => {
		const screen = PHONES[0];
		// Held still in the top-left corner, leaving most of the board free
		const player = new PlayerDot(PLAYER_SIZE / 2, PLAYER_SIZE / 2, GAME_COLORS[0], PLAYER_SIZE, 0);
		/** "Near" a spot: within two player widths of it */
		const near = 2 * PLAYER_SIZE;
		const run = pointDots(new SpawnSystem(seededRandom(11)), () => player, screen, 4000);
		/** Skip the start of the run, so the memory has had every chance to wear out */
		const from = 500;

		/** How often a point dot lands within `distance` of the one `back` spawns before it */
		function nearRate(back: number, distance = near): number {
			let hits = 0;
			for (let i = from; i < run.length; i++) {
				const before = run[i - back];
				if (Math.hypot(run[i].x - before.x, run[i].y - before.y) < distance) hits++;
			}
			return hits / (run.length - from);
		}

		/**
		 * The same rate for points placed uniformly where a point dot may go (in the spawn area,
		 * two player widths clear of the player), sampled here by rejection
		 */
		const uniformRate = (() => {
			const random = seededRandom(99);
			const clear = PLAYER_SIZE / 2 + 2 * PLAYER_SIZE + POINT_SIZE / 2;
			const spot = () => {
				for (;;) {
					const x = POINT_SIZE + random() * (screen.width - 2 * POINT_SIZE);
					const y = POINT_SIZE + random() * (screen.height - 2 * POINT_SIZE);
					if (Math.hypot(x - player.x, y - player.y) >= clear) return { x, y };
				}
			};
			let hits = 0;
			const pairs = 40000;
			for (let i = 0; i < pairs; i++) {
				const a = spot();
				const b = spot();
				if (Math.hypot(a.x - b.x, a.y - b.y) < near) hits++;
			}
			return hits / pairs;
		})();

		it("lands near the last few point dots less often than uniform placement would, all run long", () => {
			const recent = (nearRate(1) + nearRate(2) + nearRate(3)) / 3;
			expect(recent).toBeLessThan(uniformRate * 0.9);
		});

		it("still lands right by the last point dot now and then", () => {
			expect(nearRate(1, PLAYER_SIZE)).toBeGreaterThan(0);
		});

		it("lets an area that had a point dot a dozen spawns ago be as likely as any again", () => {
			expect(nearRate(12)).toBeGreaterThan(uniformRate * 0.9);
		});
	});

	describe("point dot placement over runs", () => {
		const player = new PlayerDot(100, 300, GAME_COLORS[0], PLAYER_SIZE, 0);
		const still = () => player;
		const spots = (dots: PointDot[]) => dots.map((dot) => [dot.x, dot.y]);
		/** A spawner on a random source that can be started over from its seed */
		function rewindable(seed: number) {
			let random = seededRandom(seed);
			const system = new SpawnSystem(() => random());
			return {
				system,
				rewind: () => {
					random = seededRandom(seed);
				},
			};
		}

		it("places point dots the same way for the same seed", () => {
			const a = pointDots(new SpawnSystem(seededRandom(4)), still, PHONES[0], 30);
			const b = pointDots(new SpawnSystem(seededRandom(4)), still, PHONES[0], 30);
			expect(spots(a)).toEqual(spots(b));
			const other = pointDots(new SpawnSystem(seededRandom(5)), still, PHONES[0], 30);
			expect(spots(other)).not.toEqual(spots(a));
		});

		it("starts a run with no memory of the last run's point dots", () => {
			const fresh = pointDots(new SpawnSystem(seededRandom(4)), still, PHONES[0], 10);
			const replayed = rewindable(4);
			pointDots(replayed.system, still, PHONES[0], 30);
			replayed.system.reset();
			replayed.rewind();
			expect(spots(pointDots(replayed.system, still, PHONES[0], 10))).toEqual(spots(fresh));
		});

		it("carries no memory over to a new screen size", () => {
			const fresh = pointDots(new SpawnSystem(seededRandom(4)), still, PHONES[1], 10);
			const resized = rewindable(4);
			const before = pointDots(resized.system, still, PHONES[0], 30);
			resized.rewind();
			const after = before[before.length - 1].createStep;
			expect(spots(pointDots(resized.system, still, PHONES[1], 10, after))).toEqual(spots(fresh));
		});
	});

	describe("point dot placement without room", () => {
		/** Too small for the clear space: the spawn area runs from 50 to 150 each way */
		const tiny = { width: 200, height: 200 };
		const player = new PlayerDot(40, 60, GAME_COLORS[0], PLAYER_SIZE, 0);

		/** The ticks point dots spawn on, and their colours, over a stretch of play */
		function spawnTicks(screen: ScreenSize): string[] {
			const system = new SpawnSystem(seededRandom(5));
			const spawned: string[] = [];
			for (let tick = 1; tick <= 4000; tick++) {
				const dot = system.trySpawnPointDot(tick, player, screen, PHONE_DENSITY);
				if (!dot) continue;
				spawned.push(`${tick} ${dot.color}`);
				dot.startAbsorb();
			}
			return spawned;
		}

		it("still spawns a point dot, in the corner of the spawn area farthest from the player", () => {
			const system = new SpawnSystem(seededRandom(5));
			for (const dot of pointDots(system, () => player, tiny, 5)) {
				expect(dot.x).toBe(150);
				expect(dot.y).toBe(150);
			}
		});

		it("spawns point dots on the same ticks, in the same colours, as with room to spare", () => {
			const roomy = spawnTicks(PHONES[0]);
			expect(roomy.length).toBeGreaterThan(5);
			expect(spawnTicks(tiny)).toEqual(roomy);
		});
	});

	describe("identity", () => {
		const screen = { width: 400, height: 800 };
		const player = new PlayerDot(10, 10, "#E91E63", 12.5, 0);

		it("gives each dot its own id and kind, counting from the start of each game", () => {
			const small = spawn.trySpawnSmallDot(1, 0, screen, 100, false);
			const point = spawn.trySpawnPointDot(POINT_DOT_TIME_BETWEEN + 1, player, screen, 100);
			expect(small).toMatchObject({ id: "dot-0", kind: "small" });
			expect(point).toMatchObject({ id: "dot-1", kind: "point" });
			expect(player).toMatchObject({ id: "player", kind: "player" });

			spawn.reset();
			const again = spawn.trySpawnSmallDot(1, 0, screen, 100, false);
			expect(again?.id).toBe("dot-0");
		});
	});

	describe("small dot heading", () => {
		const screen = { width: 400, height: 800 };
		/** The least a heading moves across the screen, or along its edge, per unit of travel */
		const LEAST = Math.sin(((45 - SMALL_DOT_HEADING_SPREAD) * Math.PI) / 180);

		/** One drip from scripted rolls (edge, how far along it, which way, how steep), shot off */
		function spawnFrom(side: number, along = 0.5, sideRoll = 0.5, spreadRoll = 0.5) {
			const rolls = [side / 4, along, sideRoll, spreadRoll];
			const system = new SpawnSystem(() => rolls.shift() ?? 0.5);
			const dot = system.trySpawnSmallDot(1, 0, screen, 100, false);
			if (!dot) throw new Error("no spawn");
			return launched(dot);
		}

		it("leaves each edge heading inward on a diagonal at unit speed", () => {
			const left = spawnFrom(0);
			const right = spawnFrom(1);
			const top = spawnFrom(2);
			const bottom = spawnFrom(3);
			expect(left.vx).toBeGreaterThan(LEAST);
			expect(right.vx).toBeLessThan(-LEAST);
			expect(top.vy).toBeGreaterThan(LEAST);
			expect(bottom.vy).toBeLessThan(-LEAST);
			for (const dot of [left, right, top, bottom]) {
				expect(Math.hypot(dot.vx, dot.vy)).toBeCloseTo(1);
				expect(Math.abs(dot.vx)).toBeGreaterThanOrEqual(LEAST - 1e-9);
				expect(Math.abs(dot.vy)).toBeGreaterThanOrEqual(LEAST - 1e-9);
			}
		});

		it("moves 1.8 px a tick at a density of 100 once shot off", () => {
			const dot = spawnFrom(0);
			const before = { x: dot.x, y: dot.y };
			dot.update(0);
			expect(Math.hypot(dot.x - before.x, dot.y - before.y)).toBeCloseTo(1.8);
		});

		it("never sets a dot off straight across the screen or along its edge", () => {
			let n = 0;
			const system = new SpawnSystem(() => ((++n * 9301 + 49297) % 233280) / 233280);
			for (let i = 1; i <= 500; i++) {
				const dot = system.trySpawnSmallDot(1, 0, screen, 100, false);
				expect(dot).not.toBeNull();
				if (!dot) continue;
				launched(dot);
				expect(Math.abs(dot.vx)).toBeGreaterThanOrEqual(LEAST - 1e-9);
				expect(Math.abs(dot.vy)).toBeGreaterThanOrEqual(LEAST - 1e-9);
			}
		});

		it("a dot spawning by a corner heads away from it", () => {
			// Top-left corner: down from the left edge, right from the top edge
			expect(spawnFrom(0, 0, 0.99).vy).toBeGreaterThan(LEAST);
			expect(spawnFrom(2, 0, 0.99).vx).toBeGreaterThan(LEAST);
			// Bottom-right corner: up from the right edge, left from the bottom edge
			expect(spawnFrom(1, 1, 0.99).vy).toBeLessThan(-LEAST);
			expect(spawnFrom(3, 1, 0.99).vx).toBeLessThan(-LEAST);
		});
	});
});
