import type { PlayerDot } from "../entities/PlayerDot";
import type { PointDot } from "../entities/PointDot";
import type { SmallDot } from "../entities/SmallDot";
import type { ScreenSize } from "../types";

/**
 * What the engine spawns, asked once per tick. SpawnSystem is the game's; a test can hand the
 * engine one that stages exactly the dots it needs.
 */
export interface Spawner {
	/** Forget everything about the last game */
	reset(): void;
	/** The next small dot to start forming on a wall, if any (asked every tick, kiosk too) */
	trySpawnSmallDot(
		timeStep: number,
		dotCount: number,
		screen: ScreenSize,
		density: number,
		isKiosk: boolean,
	): SmallDot | null;
	/** The next point dot, if any (asked every tick of a game, after the small dot) */
	trySpawnPointDot(
		timeStep: number,
		player: PlayerDot,
		screen: ScreenSize,
		density: number,
	): PointDot | null;
}
