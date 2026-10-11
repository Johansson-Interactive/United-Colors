import {
	GAME_COLORS,
	KIOSK_DOT_LIMIT,
	MAX_TIME_DIFFICULTY,
	POINT_DOT_TIME_BETWEEN,
	SMALL_DOT_CREATE_INTERVAL,
} from "../../domain/constants";
import { SpawnSystem } from "../../domain/engine/SpawnSystem";
import { resetDotIdCounter } from "../../domain/entities/Dot";
import { PlayerDot } from "../../domain/entities/PlayerDot";

describe("SpawnSystem", () => {
	let spawn: SpawnSystem;

	beforeEach(() => {
		resetDotIdCounter();
		spawn = new SpawnSystem(() => 0.5);
		spawn.reset();
	});

	describe("spawn wait time", () => {
		it("returns full interval at time step 0", () => {
			expect(spawn.getSpawnWaitTime(0, false)).toBe(SMALL_DOT_CREATE_INTERVAL);
		});

		it("returns half interval at midpoint", () => {
			const mid = MAX_TIME_DIFFICULTY / 2;
			expect(spawn.getSpawnWaitTime(mid, false)).toBe(SMALL_DOT_CREATE_INTERVAL * 0.5);
		});

		it("returns 0 at max difficulty", () => {
			expect(spawn.getSpawnWaitTime(MAX_TIME_DIFFICULTY, false)).toBe(0);
		});

		it("caps at 0 beyond max difficulty", () => {
			expect(spawn.getSpawnWaitTime(MAX_TIME_DIFFICULTY + 1000, false)).toBe(0);
		});

		it("always returns full interval in kiosk mode", () => {
			expect(spawn.getSpawnWaitTime(MAX_TIME_DIFFICULTY, true)).toBe(SMALL_DOT_CREATE_INTERVAL);
		});
	});

	describe("small dot spawning", () => {
		it("does not spawn before wait time", () => {
			const dot = spawn.trySpawnSmallDot(1, 0, { width: 400, height: 800 }, 100, false);
			expect(dot).toBeNull();
		});

		it("spawns after wait time elapses", () => {
			const dot = spawn.trySpawnSmallDot(
				SMALL_DOT_CREATE_INTERVAL + 1,
				0,
				{ width: 400, height: 800 },
				100,
				false,
			);
			expect(dot).not.toBeNull();
		});

		it("does not exceed kiosk dot limit", () => {
			const dot = spawn.trySpawnSmallDot(
				SMALL_DOT_CREATE_INTERVAL + 1,
				KIOSK_DOT_LIMIT,
				{ width: 400, height: 800 },
				100,
				true,
			);
			expect(dot).toBeNull();
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
				spawn.trySpawnSmallDot(SMALL_DOT_CREATE_INTERVAL * 2 * i, 0, screen, 100, false);
			}
			// random() = 0.5 with player [0] excluded -> [1] and [2] equal -> 0.5 picks [2]
			const dot = spawn.trySpawnPointDot(MAX_TIME_DIFFICULTY, player, screen, 100);
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
});
