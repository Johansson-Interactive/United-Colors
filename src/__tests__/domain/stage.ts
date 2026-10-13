import { dripOffset } from "../../domain/engine/Drip";
import type { Spawner } from "../../domain/engine/Spawner";
import type { PointDot } from "../../domain/entities/PointDot";
import { type Heading, SmallDot } from "../../domain/entities/SmallDot";

/**
 * A spawner that hands the engine exactly the dots a test queues, one of each kind per tick at
 * most, and nothing else. Queued dots survive the engine's reset at the start of a game.
 * `dotCounts` records the dot count the engine reports each tick, after removing the dots that
 * have gone.
 */
export function scriptedSpawner() {
	const small: SmallDot[] = [];
	const point: PointDot[] = [];
	const dotCounts: number[] = [];
	const spawner: Spawner = {
		reset: () => {},
		trySpawnSmallDot: (_timeStep, dotCount) => {
			dotCounts.push(dotCount);
			return small.shift() ?? null;
		},
		trySpawnPointDot: () => point.shift() ?? null,
	};
	return { spawner, small, point, dotCounts };
}

/** The size staged small dots have unless a test says otherwise */
export const STAGED_SMALL_DOT_SIZE = 6;

interface StagedDotOptions {
	id?: string;
	size?: number;
}

interface SmallDotOptions extends StagedDotOptions {
	/** Unit heading it sets off along; it drifts at `speed` px per tick */
	heading?: Heading;
	speed?: number;
}

/**
 * A small dot that forms in its first tick and leaves its wall centred on `at`, drifting from
 * there along `heading` (by default it stays where it is). Its wall runs through the spot it
 * forms from, so it is clear of the screen's walls wherever it is staged.
 */
export function smallDotAt(
	at: { x: number; y: number },
	color: string,
	{
		id = "staged",
		heading = { vx: 1, vy: 0 },
		speed = 0,
		size = STAGED_SMALL_DOT_SIZE,
	}: SmallDotOptions = {},
): SmallDot {
	const radius = size / 2;
	const offset = dripOffset(1, 1, 0, heading.vx, heading.vy);
	const foot = { x: at.x - offset.x * radius, y: at.y - offset.y * radius };
	const growTicks = 1;
	// On a wall facing right (inward normal 1, 0)
	return new SmallDot(id, 1, 0, foot, heading, color, size, speed, growTicks);
}

/**
 * A drip that forms over `growTicks` from `foot` on a wall facing right, then sets off down
 * and in
 */
export function dripAt(
	foot: { x: number; y: number },
	color: string,
	{
		id = "drip",
		growTicks = 120,
		size = STAGED_SMALL_DOT_SIZE,
	}: StagedDotOptions & { growTicks?: number } = {},
): SmallDot {
	// On a wall facing right (inward normal 1, 0)
	return new SmallDot(id, 1, 0, foot, { vx: 0.6, vy: 0.8 }, color, size, 2, growTicks);
}
