import {
	POINT_DOT_FADE_TIME,
	POINT_DOT_PULSE_SCALE,
	POINT_DOT_PULSE_SPEED,
	POINT_DOT_SIZE_ANIMATION_TIME,
} from "../constants";
import { Dot } from "./Dot";

type AnimationPhase = "zoom_in" | "pulsing" | "zoom_out" | "done";

/**
 * A stationary point dot that the player collects for bonus points.
 * Has a lifecycle: zoom-in -> pulse -> fade-out after timeout.
 */
export class PointDot extends Dot {
	readonly value: number;
	readonly createStep: number;
	private targetSize: number;
	private animPhase: AnimationPhase = "zoom_in";
	private animStart: number;
	private animFrom: number;
	private animTo: number;
	private pulseDirection: "shrink" | "grow" = "shrink";

	constructor(
		id: string,
		timeStep: number,
		x: number,
		y: number,
		color: string,
		size: number,
		value: number,
	) {
		super(id, x, y, 0, 0, color, 0, 0, "point");
		this.value = value;
		this.createStep = timeStep;
		this.targetSize = size;

		// Start zoom-in animation
		this.animStart = timeStep;
		this.animFrom = 0;
		this.animTo = size;
	}

	override update(timeStep: number): void {
		if (this.isAbsorbing) {
			super.update(timeStep);
			return;
		}
		switch (this.animPhase) {
			case "zoom_in":
				this.updateZoomIn(timeStep);
				break;
			case "pulsing":
				this.updatePulse(timeStep);
				break;
			case "zoom_out":
				this.updateZoomOut(timeStep);
				break;
			case "done":
				break;
		}

		// Check fade timeout (only flag if not already flagged)
		if (
			timeStep - this.createStep >= POINT_DOT_FADE_TIME &&
			!this.isFlaggedForRemoval &&
			this.animPhase !== "zoom_out" &&
			this.animPhase !== "done"
		) {
			this.startZoomOut(timeStep);
			super.flagForRemoval();
		}
	}

	private updateZoomIn(timeStep: number): void {
		const elapsed = timeStep - this.animStart;
		const progress = Math.min(elapsed / POINT_DOT_SIZE_ANIMATION_TIME, 1);
		const size = this.animFrom + (this.animTo - this.animFrom) * progress;
		this.setSize(size);

		if (progress >= 1) {
			this.animPhase = "pulsing";
			this.animStart = timeStep;
			this.pulseDirection = "shrink";
			this.animFrom = this.targetSize;
			this.animTo = this.targetSize * POINT_DOT_PULSE_SCALE;
		}
	}

	private updatePulse(timeStep: number): void {
		const elapsed = timeStep - this.animStart;
		const progress = Math.min(elapsed / POINT_DOT_PULSE_SPEED, 1);
		const size = this.animFrom + (this.animTo - this.animFrom) * progress;
		this.setSize(size);

		if (progress >= 1) {
			// Reverse pulse direction
			this.animStart = timeStep;
			if (this.pulseDirection === "shrink") {
				this.pulseDirection = "grow";
				this.animFrom = this.targetSize * POINT_DOT_PULSE_SCALE;
				this.animTo = this.targetSize;
			} else {
				this.pulseDirection = "shrink";
				this.animFrom = this.targetSize;
				this.animTo = this.targetSize * POINT_DOT_PULSE_SCALE;
			}
		}
	}

	private startZoomOut(timeStep: number): void {
		this.animPhase = "zoom_out";
		this.animStart = timeStep;
		this.animFrom = this.size;
		this.animTo = 0;
	}

	private updateZoomOut(timeStep: number): void {
		const elapsed = timeStep - this.animStart;
		const progress = Math.min(elapsed / POINT_DOT_SIZE_ANIMATION_TIME, 1);
		const size = this.animFrom + (this.animTo - this.animFrom) * progress;
		this.setSize(Math.max(0, size));

		if (progress >= 1) {
			this.animPhase = "done";
		}
	}

	/** Caught: the pulse stops and the dot merges into the player */
	override startAbsorb(): void {
		if (this.isAbsorbing) return;
		super.startAbsorb();
		this.animPhase = "done";
	}

	override get isFlaggedForRemoval(): boolean {
		// Not removable while zoom-out animation is still playing
		if (this.animPhase === "zoom_out") return false;
		if (this.isAbsorbing) return super.isFlaggedForRemoval;
		return super.isFlaggedForRemoval || this.animPhase === "done";
	}
}
