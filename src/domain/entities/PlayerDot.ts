import type { ScreenSize } from "../types";
import { Dot } from "./Dot";

/**
 * The player-controlled dot. Movement via gyro (orientation) or direct touch (pixel delta).
 * Bounds-clamped so it cannot leave the screen.
 */
export class PlayerDot extends Dot {
	private tiltX = 0;
	private tiltY = 0;
	/** Speed (px/s) the walls held the player back by on the last advance, signed toward the wall */
	private pushX = 0;
	private pushY = 0;

	/** `speed` in px/s per radian of tilt, stored as `velocity`; there is one player, "player" */
	constructor(x: number, y: number, color: string, size: number, speed: number) {
		super("player", x, y, 0, 0, color, size, speed, "player");
	}

	/** Called when new sensor data arrives (gyro tilt in radians) */
	updateOrientation(x: number, y: number): void {
		this.tiltX = x;
		this.tiltY = y;
	}

	/** Apply a one-shot movement in pixels (e.g. touch drag). Clamped to screen bounds. */
	applyMovementDelta(dx: number, dy: number, screen: ScreenSize): void {
		const halfSize = this.size / 2;
		this.x = Math.max(halfSize, Math.min(screen.width - halfSize, this.x + dx));
		this.y = Math.max(halfSize, Math.min(screen.height - halfSize, this.y + dy));
	}

	/**
	 * Move player over `dtMs` of real time. Velocity follows tilt linearly (legacy), applied
	 * instantly with no threshold, no acceleration and no smoothing.
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
	 * signed toward the wall: negative x pushes into the left wall, positive y into the bottom
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
