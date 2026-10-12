import type { ScreenSize } from "../types";
import { Dot } from "./Dot";

/**
 * The player-controlled dot. Movement via gyro (orientation) or direct touch (pixel delta).
 * Bounds-clamped so it cannot leave the screen.
 */
export class PlayerDot extends Dot {
	private tiltX = 0;
	private tiltY = 0;

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
		this.applyMovementDelta(this.tiltX * scale, this.tiltY * scale, screen);
	}

	/** Override base update -- player uses advance instead */
	override update(_timeStep: number): void {
		// no-op: player movement is driven by advance
	}
}
