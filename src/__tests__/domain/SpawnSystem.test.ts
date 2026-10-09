import {
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

		it("waits after a collected point dot is removed before respawning", () => {
			const first = spawn.trySpawnPointDot(wait + 1, player, screen, 100);
			expect(first).not.toBeNull();

			// Alive until collected at step 1000
			expect(spawn.trySpawnPointDot(1000, player, screen, 100)).toBeNull();
			first?.forceRemove();

			expect(spawn.trySpawnPointDot(1001, player, screen, 100)).toBeNull();
			expect(spawn.trySpawnPointDot(1000 + wait, player, screen, 100)).toBeNull();
			expect(spawn.trySpawnPointDot(1000 + wait + 1, player, screen, 100)).not.toBeNull();
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
