import {
	DOT_LIMIT,
	KIOSK_DOT_LIMIT,
	MAX_TIME_DIFFICULTY,
	POINT_DOT_SIZE_RATIO,
	POINT_DOT_TIME_BETWEEN,
	POINT_DOT_VALUE,
	SMALL_DOT_CREATE_INTERVAL,
	SMALL_DOT_SIZE_RATIO,
	SMALL_DOT_SPEED_RATIO,
} from "../constants";
import { Dot } from "../entities/Dot";
import type { PlayerDot } from "../entities/PlayerDot";
import { PointDot } from "../entities/PointDot";
import type { ScreenSize } from "../types";
import { didCollide } from "./Collision";
import { ColorPicker } from "./ColorPicker";

/**
 * Handles spawning of small dots and point dots.
 * Small and point dots pick colors from separate weighted pickers; point dots never
 * spawn in the player's current color.
 * Replicates legacy GameManager spawn logic.
 */
export class SpawnSystem {
	private dotCreateStep = 0;
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
		this.smallDotColors.reset();
		this.pointDotColors.reset();
		this.dotCreateStep = 0;
		this.pointStep = 0;
		this.pointDot = null;
	}

	/** Get the current point dot reference */
	getPointDot(): PointDot | null {
		return this.pointDot;
	}

	/**
	 * Calculate spawn wait time based on difficulty curve.
	 * Spawn interval decreases linearly from SMALL_DOT_CREATE_INTERVAL to 0.
	 */
	getSpawnWaitTime(timeStep: number, isKiosk: boolean): number {
		if (isKiosk) return SMALL_DOT_CREATE_INTERVAL;

		const percent = Math.min(timeStep / MAX_TIME_DIFFICULTY, 1);
		return SMALL_DOT_CREATE_INTERVAL * (1 - percent);
	}

	/**
	 * Try to spawn a small dot from a random screen edge.
	 * Returns new dot or null if conditions aren't met.
	 */
	trySpawnSmallDot(
		timeStep: number,
		dotCount: number,
		screen: ScreenSize,
		density: number,
		isKiosk: boolean,
	): Dot | null {
		const waitTime = this.getSpawnWaitTime(timeStep, isKiosk);

		if (timeStep - this.dotCreateStep <= waitTime) return null;
		if (isKiosk && dotCount >= KIOSK_DOT_LIMIT) return null;
		if (dotCount >= DOT_LIMIT) return null;

		this.dotCreateStep = timeStep;
		return this.createRandomDot(screen, density);
	}

	/**
	 * Try to spawn or manage a point dot.
	 * Returns new PointDot or null.
	 * Like legacy mPointDot, the last point dot stays referenced after removal (faded or
	 * collected) so the respawn wait counts from its removal; it is only cleared on reset.
	 */
	trySpawnPointDot(
		timeStep: number,
		player: PlayerDot,
		screen: ScreenSize,
		density: number,
	): PointDot | null {
		const halfInterval = POINT_DOT_TIME_BETWEEN / 2;
		const interval = Math.floor(this.random() * POINT_DOT_TIME_BETWEEN);
		const randomTime = interval + halfInterval;

		if (this.pointDot != null) {
			if (this.pointDot.isFlaggedForRemoval) {
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

	private createRandomDot(screen: ScreenSize, density: number): Dot {
		const size = SMALL_DOT_SIZE_RATIO * density;
		const maxX = screen.width - size;
		const maxY = screen.height - size;
		const halfY = maxY / 2 + size / 2;
		const halfX = maxX / 2 + size / 2;

		let x = Math.ceil(size / 2);
		let y = Math.ceil(size / 2);
		let vx = 1;
		let vy = 1;

		const side = Math.floor(this.random() * 4);

		switch (side) {
			case 0: {
				// Left
				y = this.random() * maxY + size;
				const k = y / halfY - 1;
				vx = Math.abs(k);
				vy = this.random() - k;
				break;
			}
			case 1: {
				// Right
				x = Math.floor(maxX + size / 2);
				y = this.random() * maxY + size;
				const k = y / halfY - 1;
				vx = -Math.abs(k);
				vy = this.random() - k;
				break;
			}
			case 2: {
				// Top
				x = this.random() * maxX + size;
				const k = x / halfX - 1;
				vx = this.random() - k;
				vy = Math.abs(k);
				break;
			}
			case 3: {
				// Bottom
				x = this.random() * maxX + size;
				y = Math.floor(maxY + size / 2);
				const k = x / halfX - 1;
				vx = this.random() - k;
				vy = -Math.abs(k);
				break;
			}
		}

		// Normalize direction
		const len = Math.sqrt(vx * vx + vy * vy);
		if (len > 0) {
			vx /= len;
			vy /= len;
		}

		const color = this.smallDotColors.next();
		return new Dot(x, y, vx, vy, color, size, SMALL_DOT_SPEED_RATIO * density);
	}

	private createPointDot(
		timeStep: number,
		player: PlayerDot,
		screen: ScreenSize,
		density: number,
		color: string,
	): PointDot {
		const size = POINT_DOT_SIZE_RATIO * density;
		const x = Math.floor(this.random() * (screen.width - size * 2)) + size;
		const y = Math.floor(this.random() * (screen.height - size * 2)) + size;

		// Check if spawning on player -- retry recursively
		const tempDot = new Dot(x, y, 0, 0, player.color, size * 2, 0);
		if (didCollide(player, tempDot)) {
			return this.createPointDot(timeStep, player, screen, density, color);
		}

		return new PointDot(timeStep, x, y, color, size, POINT_DOT_VALUE);
	}
}
