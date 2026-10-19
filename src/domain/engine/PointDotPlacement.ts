import { holdInside } from "../arena";
import {
	POINT_DOT_CELL_RATIO,
	POINT_DOT_CLEAR_SPACE_RATIO,
	POINT_DOT_SUPPRESS_RADIUS_RATIO,
	POINT_DOT_SUPPRESS_STRENGTH,
	POINT_DOT_WEIGHT_FLOOR,
	POINT_DOT_WEIGHT_RECOVERY,
} from "../constants";
import type { ScreenSize } from "../types";
import { SpawnWeights } from "./SpawnWeights";

/** Where the player is and how big (a diameter), when a point dot is placed */
interface PlayerSpot {
	x: number;
	y: number;
	size: number;
}

/**
 * Where point dots spawn (ADR 0002). A point dot's centre goes in the spawn area, a dot's
 * width in from the screen's edges, in one weighted draw from a grid of cells over it. Cells
 * touching the circle POINT_DOT_CLEAR_SPACE_RATIO clear of the player are blocked, so no point
 * dot is caught by accident. Each spawn makes the cells round where it landed less likely for
 * the next few, and every spawn first lets all of them recover part of the way, so point dots
 * move round the board without any part of it going dead. One that would touch a rounded
 * corner is pushed in off its curve, as far from it as from the edges, rather than placed
 * again; and with no room at all it goes in the corner farthest from the player, so placement
 * never holds a point dot back.
 *
 * The memory lasts one run: it is cleared on reset and laid out afresh for a new screen size.
 * It knows nothing of when point dots spawn or what colour they are; SpawnSystem does.
 */
export class PointDotPlacement {
	private random: () => number;
	private weights: SpawnWeights | null = null;
	/** The screen, dot size and density the weights were laid out for */
	private width = 0;
	private height = 0;
	private size = 0;
	private density = 0;
	private readonly picked = { x: 0, y: 0 };

	constructor(random: () => number) {
		this.random = random;
	}

	/** Forget the last run's point dots */
	reset(): void {
		this.weights?.clear();
	}

	/** The centre of the next point dot, of diameter `size`, with the player where it is now */
	place(
		screen: ScreenSize,
		size: number,
		player: PlayerSpot,
		density: number,
	): { x: number; y: number } {
		const weights = this.weightsFor(screen, size, density);
		const clear = player.size / 2 + POINT_DOT_CLEAR_SPACE_RATIO * density + size / 2;
		weights.recover(POINT_DOT_WEIGHT_RECOVERY);
		weights.block(player.x, player.y, clear);
		if (weights.pick(this.random, this.picked)) {
			const reach = POINT_DOT_SUPPRESS_RADIUS_RATIO * density;
			weights.suppress(this.picked.x, this.picked.y, reach, POINT_DOT_SUPPRESS_STRENGTH);
		} else {
			this.farthestCorner(screen, size, player);
		}
		return holdInside(screen, this.picked.x, this.picked.y, size);
	}

	/**
	 * With no room clear of the player (only on a screen far smaller than a phone's), the
	 * corner of the spawn area farthest from it, so a point dot still spawns on time
	 */
	private farthestCorner(screen: ScreenSize, size: number, player: PlayerSpot): void {
		const right = Math.max(size, screen.width - size);
		const bottom = Math.max(size, screen.height - size);
		this.picked.x = player.x < (size + right) / 2 ? right : size;
		this.picked.y = player.y < (size + bottom) / 2 ? bottom : size;
	}

	/** The weights for this screen, dot size and density, laid out afresh if any has changed */
	private weightsFor(screen: ScreenSize, size: number, density: number): SpawnWeights {
		if (
			this.weights &&
			this.width === screen.width &&
			this.height === screen.height &&
			this.size === size &&
			this.density === density
		) {
			return this.weights;
		}
		this.width = screen.width;
		this.height = screen.height;
		this.size = size;
		this.density = density;
		this.weights = new SpawnWeights(
			size,
			size,
			screen.width - size * 2,
			screen.height - size * 2,
			POINT_DOT_CELL_RATIO * density,
			POINT_DOT_WEIGHT_FLOOR,
		);
		return this.weights;
	}
}
