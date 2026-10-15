import type { PlayerDot } from "../entities/PlayerDot";
import type { PointDot } from "../entities/PointDot";
import type { SmallDot } from "../entities/SmallDot";
import type { ScreenSize } from "../types";
import type { Spawner } from "./Spawner";
import { SpawnSystem } from "./SpawnSystem";

/**
 * The game's own spawning, run as if `aheadTicks` of play had already passed, so small dots
 * arrive at a late run's rate from the start, and holding at `maxDots` once that many are in
 * play. Point dots come as in any run. For the bench run, which measures a late run at a
 * steady load (see application/bench.ts).
 */
export class BenchSpawner implements Spawner {
	private readonly inner: SpawnSystem;

	constructor(
		random: () => number,
		private readonly aheadTicks: number,
		private readonly maxDots: number,
	) {
		this.inner = new SpawnSystem(random);
	}

	reset(): void {
		this.inner.reset();
	}

	trySpawnSmallDot(
		timeStep: number,
		dotCount: number,
		screen: ScreenSize,
		density: number,
		isKiosk: boolean,
	): SmallDot | null {
		if (!isKiosk && dotCount >= this.maxDots) return null;
		const at = isKiosk ? timeStep : timeStep + this.aheadTicks;
		return this.inner.trySpawnSmallDot(at, dotCount, screen, density, isKiosk);
	}

	trySpawnPointDot(
		timeStep: number,
		player: PlayerDot,
		screen: ScreenSize,
		density: number,
	): PointDot | null {
		return this.inner.trySpawnPointDot(timeStep, player, screen, density);
	}
}
