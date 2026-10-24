import { holdInside } from "../arena";
import { PLAYER_DEAD_ZONE_RAD, PLAYER_FULL_TILT_FROM_RAD, PLAYER_TOP_TILT_RAD } from "../constants";
import { smoothstep } from "../smoothstep";
import type { ScreenSize, TiltAngles } from "../types";
import { Dot } from "./Dot";

/**
 * The tilt the player moves by: none inside the dead zone, easing in up to
 * PLAYER_FULL_TILT_FROM_RAD, as it is from there, and no more than PLAYER_TOP_TILT_RAD in any
 * direction, so a diagonal is no faster than straight
 */
export function shapeTilt(tilt: TiltAngles): TiltAngles {
	const size = Math.hypot(tilt.x, tilt.y);
	if (size <= PLAYER_DEAD_ZONE_RAD) return { x: 0, y: 0 };
	const ease = smoothstep(PLAYER_DEAD_ZONE_RAD, PLAYER_FULL_TILT_FROM_RAD, size);
	const shaped = Math.min(PLAYER_TOP_TILT_RAD, size * ease);
	return { x: (tilt.x * shaped) / size, y: (tilt.y * shaped) / size };
}

/**
 * The player-controlled dot. Movement via gyro (orientation) or direct touch (pixel delta).
 * Held inside the arena so it cannot leave the screen.
 */
export class PlayerDot extends Dot {
	private tiltX = 0;
	private tiltY = 0;
	/** Velocity (px/s) the walls held the player back by on the last advance, pointing into them */
	private pushX = 0;
	private pushY = 0;

	/** `speed` in px/s per radian of tilt, stored as `velocity`; there is one player, "player" */
	constructor(x: number, y: number, color: string, size: number, speed: number) {
		super("player", x, y, 0, 0, color, size, speed, "player");
	}

	/** Called when new sensor data arrives (tilt in radians), shaped as the dot moves by it */
	updateOrientation(x: number, y: number): void {
		const shaped = shapeTilt({ x, y });
		this.tiltX = shaped.x;
		this.tiltY = shaped.y;
	}

	/**
	 * Apply a one-shot movement in pixels (e.g. touch drag), held inside the arena: against a
	 * wall the player keeps the part of the movement along it, so it slides round a rounded
	 * corner (see arena.ts)
	 */
	applyMovementDelta(dx: number, dy: number, screen: ScreenSize): void {
		const held = holdInside(screen, this.x + dx, this.y + dy, this.size / 2);
		this.x = held.x;
		this.y = held.y;
	}

	/**
	 * Move player over `dtMs` of real time. Velocity follows the shaped tilt (see shapeTilt),
	 * applied instantly with no acceleration and no smoothing.
	 */
	advance(dtMs: number, screen: ScreenSize): void {
		const scale = (this.velocity * dtMs) / 1000;
		const dx = this.tiltX * scale;
		const dy = this.tiltY * scale;
		const wantedX = this.x + dx;
		const wantedY = this.y + dy;
		this.applyMovementDelta(dx, dy, screen);
		// Whatever the clamp took away is the player pushing into a wall
		this.pushX = dtMs > 0 ? ((wantedX - this.x) * 1000) / dtMs : 0;
		this.pushY = dtMs > 0 ? ((wantedY - this.y) * 1000) / dtMs : 0;
	}

	/**
	 * How hard the player is pushing into the walls (px/s of movement they are holding back),
	 * pointing into them: negative x pushes into the left wall, positive y into the bottom
	 */
	get push(): { x: number; y: number } {
		return { x: this.pushX, y: this.pushY };
	}

	/** The player is not driving (not RUNNING): no push on any wall */
	clearPush(): void {
		this.pushX = 0;
		this.pushY = 0;
	}

	/** Override base update -- player uses advance instead */
	override update(_timeStep: number): void {
		// no-op: player movement is driven by advance
	}
}
