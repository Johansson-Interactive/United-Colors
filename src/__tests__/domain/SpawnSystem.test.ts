import { cornerExtent } from "../../domain/arena";
import {
	DOT_LIMIT,
	GAME_COLORS,
	GAME_HERTZ,
	KIOSK_DOT_LIMIT,
	POINT_DOT_TIME_BETWEEN,
	SMALL_DOT_CREATE_INTERVAL,
	SMALL_DOT_HEADING_SPREAD,
	SMALL_DOT_MIN_GROW_TICKS,
	SMALL_DOT_RATE_GROWTH,
	SMALL_DOT_SIZE_RATIO,
} from "../../domain/constants";
import { SpawnSystem } from "../../domain/engine/SpawnSystem";
import { PlayerDot } from "../../domain/entities/PlayerDot";
import type { SmallDot } from "../../domain/entities/SmallDot";

/** Ticks in a minute. One minute in, dots come 25 a minute: one every 72 ticks */
const MINUTE = GAME_HERTZ * 60;
/** So far into a run (200 minutes) that the spawn interval is under a tick */
const LATE = 200 * MINUTE;

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

		it("a point dot that would land in a corner is placed again", () => {
			// Draws: timing, color, then (0, 0) for the first candidate, in the top-left corner
			const rolls = [0.5, 0.5, 0, 0, 0.5, 0.5];
			const scripted = new SpawnSystem(() => rolls.shift() ?? 0.5);
			scripted.reset();
			const centred = new PlayerDot(390, 790, "#E91E63", 12.5, 0);
			const dot = scripted.trySpawnPointDot(POINT_DOT_TIME_BETWEEN + 1, centred, rounded, 100);
			expect(dot?.x).toBe(199.5);
			expect(dot?.y).toBe(399.5);
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

		it("re-rolls a point dot position that lands on the player", () => {
			// Draws: timing (0.5), color (0.5), then x/y for the first candidate (0, 0) which
			// sits on the player at (10, 10), then x/y for the second candidate (0.5, 0.5)
			const rolls = [0.5, 0.5, 0, 0, 0.5, 0.5];
			const scripted = new SpawnSystem(() => rolls.shift() ?? 0.5);
			scripted.reset();

			const dot = scripted.trySpawnPointDot(wait + 1, player, screen, 100);
			// size 12.5: x = floor(0.5 * 375) + 12.5, y = floor(0.5 * 775) + 12.5
			expect(dot?.x).toBe(199.5);
			expect(dot?.y).toBe(399.5);
		});

		it("gives up re-rolling after a bounded number of attempts", () => {
			let draws = 0;
			// Every candidate is (12.5, 12.5), on top of the player
			const alwaysOverlap = new SpawnSystem(() => {
				draws++;
				return draws === 1 || draws === 2 ? 0.5 : 0;
			});
			alwaysOverlap.reset();

			const dot = alwaysOverlap.trySpawnPointDot(wait + 1, player, screen, 100);
			expect(dot).not.toBeNull();
			expect(dot?.x).toBe(12.5);
			expect(dot?.y).toBe(12.5);
			// timing + color + 10 attempts of x/y
			expect(draws).toBe(2 + 2 * 10);
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
