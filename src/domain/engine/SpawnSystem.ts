import {
	DOT_LIMIT,
	GAME_HERTZ,
	KIOSK_DOT_LIMIT,
	POINT_DOT_SIZE_RATIO,
	POINT_DOT_TIME_BETWEEN,
	POINT_DOT_VALUE,
	SMALL_DOT_CREATE_INTERVAL,
	SMALL_DOT_MIN_GROW_TICKS,
	SMALL_DOT_RATE_GROWTH,
	SMALL_DOT_SIZE_RATIO,
	SMALL_DOT_SPEED_RATIO,
} from "../constants";
import type { PlayerDot } from "../entities/PlayerDot";
import { PointDot } from "../entities/PointDot";
import { SmallDot } from "../entities/SmallDot";
import type { ScreenSize } from "../types";
import { circlesOverlap } from "./Collision";
import { ColorPicker } from "./ColorPicker";
import { edgeHeading } from "./Heading";
import type { Spawner } from "./Spawner";

/** Upper bound on random re-rolls when placing a point dot away from the player */
const MAX_POINT_DOT_PLACEMENT_ATTEMPTS = 10;

/**
 * Handles spawning of small dots and point dots.
 *
 * A small dot is a drip: it forms on a wall over the spawn wait and then shoots off, and the
 * moment it has left (or been plucked off by the player) the next drip starts forming. So
 * the spawn interval is how long a drip takes to form, which shortens as the difficulty
 * rises. A drip never forms faster than SMALL_DOT_MIN_GROW_TICKS, though: past the point
 * where the interval would be shorter, enough drips form at once to keep the dots arriving
 * at the interval's rate.
 *
 * Small and point dots pick colors from separate weighted pickers; point dots never
 * spawn in the player's current color. Replicates legacy GameManager spawn logic, apart from
 * the difficulty ramp (see SMALL_DOT_RATE_GROWTH).
 */
export class SpawnSystem implements Spawner {
	/** Ids run from 0 in each game, so the same seed spawns the same dots */
	private nextId = 0;
	/** The drips forming on the walls now */
	private drips: SmallDot[] = [];
	private pointStep = 0;
	private pointDot: PointDot | null = null;
	private random: () => number;
	private smallDotColors: ColorPicker;
	private pointDotColors: ColorPicker;

	constructor(random?: () => number) {
		this.random = random ?? Math.random;
		this.smallDotColors = new ColorPicker(this.random);
		this.pointDotColors = new ColorPicker(this.random);
	}

	reset(): void {
		this.nextId = 0;
		this.smallDotColors.reset();
		this.pointDotColors.reset();
		this.drips = [];
		this.pointStep = 0;
		this.pointDot = null;
	}

	/**
	 * Ticks between small dots: one over the spawn rate, which starts at one per
	 * SMALL_DOT_CREATE_INTERVAL and rises by SMALL_DOT_RATE_GROWTH a minute every minute
	 */
	getSpawnWaitTime(timeStep: number, isKiosk: boolean): number {
		if (isKiosk) return SMALL_DOT_CREATE_INTERVAL;

		const ticksPerMinute = GAME_HERTZ * 60;
		const perMinute =
			ticksPerMinute / SMALL_DOT_CREATE_INTERVAL +
			(SMALL_DOT_RATE_GROWTH * timeStep) / ticksPerMinute;
		return ticksPerMinute / perMinute;
	}

	/**
	 * Ticks a drip started now takes to form: the spawn interval (over which one dot comes
	 * through, as the legacy counted it), floored at SMALL_DOT_MIN_GROW_TICKS
	 */
	getDripGrowTicks(timeStep: number, isKiosk: boolean): number {
		const period = Math.floor(this.getSpawnWaitTime(timeStep, isKiosk)) + 1;
		return Math.max(SMALL_DOT_MIN_GROW_TICKS, period);
	}

	/**
	 * How many drips form at once: one, until the floor on the forming time would let fewer
	 * dots through than the spawn interval calls for; then as many as keep that rate
	 */
	getDripCount(timeStep: number, isKiosk: boolean): number {
		const period = Math.floor(this.getSpawnWaitTime(timeStep, isKiosk)) + 1;
		return Math.max(1, Math.round(this.getDripGrowTicks(timeStep, isKiosk) / period));
	}

	/**
	 * Start the next drip forming on a random screen edge, if fewer are forming than the
	 * difficulty calls for and the dot limit allows. Returns the new drip or null. At most
	 * one starts per tick.
	 */
	trySpawnSmallDot(
		timeStep: number,
		dotCount: number,
		screen: ScreenSize,
		density: number,
		isKiosk: boolean,
	): SmallDot | null {
		// Drips that have shot off, been plucked or gone make room for the next
		let kept = 0;
		for (const drip of this.drips) {
			if (drip.isForming && !drip.isFlaggedForRemoval) this.drips[kept++] = drip;
		}
		this.drips.length = kept;

		if (this.drips.length >= this.getDripCount(timeStep, isKiosk)) return null;
		if (isKiosk && dotCount >= KIOSK_DOT_LIMIT) return null;
		if (dotCount >= DOT_LIMIT) return null;

		const drip = this.createDrip(screen, density, this.getDripGrowTicks(timeStep, isKiosk));
		this.drips.push(drip);
		return drip;
	}

	/**
	 * Try to spawn or manage a point dot.
	 * Returns new PointDot or null.
	 * Like legacy mPointDot, the last point dot stays referenced after removal (faded or
	 * collected) so the respawn wait counts from its removal (or from being caught, before
	 * it has finished merging into the player); it is only cleared on reset.
	 */
	trySpawnPointDot(
		timeStep: number,
		player: PlayerDot,
		screen: ScreenSize,
		density: number,
	): PointDot | null {
		const halfInterval = POINT_DOT_TIME_BETWEEN / 2;
		// The wait is re-rolled on every tick while a point dot is alive, so the effective
		// respawn delay is not uniform over the range. This matches legacy spawnBigPoint,
		// which also draws a fresh interval each tick; keep it to preserve legacy behaviour.
		const interval = Math.floor(this.random() * POINT_DOT_TIME_BETWEEN);
		const randomTime = interval + halfInterval;

		if (this.pointDot != null) {
			if (this.pointDot.isFlaggedForRemoval || this.pointDot.isAbsorbing) {
				if (timeStep - this.pointStep > randomTime) {
					this.pointDot = this.createPointDot(
						timeStep,
						player,
						screen,
						density,
						this.pointDotColors.next(player.color),
					);
					this.pointStep = timeStep;
					return this.pointDot;
				}
			} else {
				this.pointStep = timeStep;
			}
			return null;
		}

		if (timeStep > randomTime) {
			this.pointDot = this.createPointDot(
				timeStep,
				player,
				screen,
				density,
				this.pointDotColors.next(player.color),
			);
			this.pointStep = timeStep;
			return this.pointDot;
		}
		return null;
	}

	/**
	 * A drip on a random edge, far enough from the corners to fit on it fully grown, that
	 * will head inward on a diagonal (see edgeHeading)
	 */
	private createDrip(screen: ScreenSize, density: number, growTicks: number): SmallDot {
		const size = SMALL_DOT_SIZE_RATIO * density;
		const spanX = screen.width - size;
		const spanY = screen.height - size;

		// Which edge, how far along it (0..1, from the top or the left), and the heading off it
		const side = Math.floor(this.random() * 4);
		const along = this.random();
		const heading = edgeHeading(along, this.random(), this.random());

		let nx = 0;
		let ny = 0;
		let foot: { x: number; y: number };
		let vx: number;
		let vy: number;
		switch (side) {
			case 0: // Left
				nx = 1;
				foot = { x: 0, y: size / 2 + along * spanY };
				vx = heading.normal;
				vy = heading.tangent;
				break;
			case 1: // Right
				nx = -1;
				foot = { x: screen.width, y: size / 2 + along * spanY };
				vx = -heading.normal;
				vy = heading.tangent;
				break;
			case 2: // Top
				ny = 1;
				foot = { x: size / 2 + along * spanX, y: 0 };
				vx = heading.tangent;
				vy = heading.normal;
				break;
			default: // Bottom
				ny = -1;
				foot = { x: size / 2 + along * spanX, y: screen.height };
				vx = heading.tangent;
				vy = -heading.normal;
				break;
		}

		const color = this.smallDotColors.next();
		return new SmallDot(
			this.newId(),
			nx,
			ny,
			foot,
			{ vx, vy },
			color,
			size,
			SMALL_DOT_SPEED_RATIO * density,
			growTicks,
		);
	}

	private createPointDot(
		timeStep: number,
		player: PlayerDot,
		screen: ScreenSize,
		density: number,
		color: string,
	): PointDot {
		const size = POINT_DOT_SIZE_RATIO * density;
		let x = 0;
		let y = 0;
		// Re-roll while the candidate would land on the player. After the last attempt the
		// final candidate is used even if it overlaps, so placement always terminates.
		for (let attempt = 0; attempt < MAX_POINT_DOT_PLACEMENT_ATTEMPTS; attempt++) {
			x = Math.floor(this.random() * (screen.width - size * 2)) + size;
			y = Math.floor(this.random() * (screen.height - size * 2)) + size;
			if (!circlesOverlap(player.x, player.y, player.size, x, y, size * 2)) break;
		}

		return new PointDot(this.newId(), timeStep, x, y, color, size, POINT_DOT_VALUE);
	}

	private newId(): string {
		return `dot-${this.nextId++}`;
	}
}
