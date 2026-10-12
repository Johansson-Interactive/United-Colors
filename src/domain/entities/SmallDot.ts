import { DRIP_LAUNCH_TICKS } from "../constants";
import { dripOffset, dripRadius } from "../engine/Drip";
import type { DotView, WallContact } from "../types";
import { Dot } from "./Dot";

type Stage = "forming" | "launching" | "free";

/** A unit heading */
export interface Heading {
	vx: number;
	vy: number;
}

/**
 * A small drifting dot. It begins as a drip forming on a wall: nothing, then a drop swelling
 * out of the wall over `growTicks`, forward along its heading, and sagging further from the
 * wall as it fills (see Drip.ts),
 * until it shoots off along its heading and, for DRIP_LAUNCH_TICKS, tears from the wall.
 * From then on it drifts, bouncing straight back off each wall it reaches.
 *
 * While forming it is part of the wall: the player can pluck a drip of their own colour off
 * it, but a drip of another colour does them no harm until it has left.
 */
export class SmallDot extends Dot {
	/** Progress of the drip forming on its wall, 0..1, and its value at the start of the tick */
	drip = 0;
	prevDrip = 0;
	/** Progress of the launch off the wall, 0..1, once the drip has shot off */
	launch = 0;
	prevLaunch = 0;
	/** The size the drip grows to */
	readonly fullSize: number;
	private stage: Stage = "forming";
	private stageTicks = 0;
	/** The wall it is on: its inward normal and a point on it */
	private nx: number;
	private ny: number;
	private footX: number;
	private footY: number;
	private readonly heading: Heading;
	private readonly growTicks: number;

	/**
	 * A drip at `foot` on the wall with inward normal (`nx`, `ny`), growing to `size` over
	 * `growTicks` and then setting off along `heading` at `velocity` px per tick
	 */
	constructor(
		id: string,
		nx: number,
		ny: number,
		foot: { x: number; y: number },
		heading: Heading,
		color: string,
		size: number,
		velocity: number,
		growTicks: number,
	) {
		super(id, foot.x, foot.y, 0, 0, color, 0, velocity, "small");
		this.nx = nx;
		this.ny = ny;
		this.footX = foot.x;
		this.footY = foot.y;
		this.heading = heading;
		this.fullSize = size;
		this.growTicks = Math.max(1, growTicks);
	}

	override get isForming(): boolean {
		// Plucked off the wall, it is merging into the player and the wall has let it go
		return this.stage === "forming" && !this.isAbsorbing;
	}

	/** Drifting (or just launched): a wall it reaches stops it */
	get isDrifting(): boolean {
		return this.stage === "free" || this.stage === "launching";
	}

	override beginTick(): void {
		super.beginTick();
		this.prevDrip = this.drip;
		this.prevLaunch = this.launch;
	}

	override update(timeStep: number): void {
		if (this.isAbsorbing || this.isRejecting) {
			super.update(timeStep);
			return;
		}
		switch (this.stage) {
			case "forming": {
				this.stageTicks++;
				this.drip = Math.min(1, this.stageTicks / this.growTicks);
				this.setSize(this.fullSize * dripRadius(this.drip));
				const radius = this.size / 2;
				const at = dripOffset(this.drip, this.nx, this.ny, this.heading.vx, this.heading.vy);
				this.x = this.footX + at.x * radius;
				this.y = this.footY + at.y * radius;
				if (this.drip >= 1) {
					this.stage = "launching";
					this.stageTicks = 0;
					this.vx = this.heading.vx;
					this.vy = this.heading.vy;
				}
				return;
			}
			case "launching": {
				super.update(timeStep);
				this.stageTicks++;
				this.launch = Math.min(1, this.stageTicks / DRIP_LAUNCH_TICKS);
				if (this.launch >= 1) this.stage = "free";
				return;
			}
			default:
				super.update(timeStep);
		}
	}

	/**
	 * The dot has reached the wall with inward normal (`nx`, `ny`) through `foot`: it is set
	 * flush against it and heads back in at once. Sets the inward sign of its heading rather
	 * than flipping it, so a dot found past the same wall twice over never judders along it.
	 */
	bounce(nx: number, ny: number, foot: { x: number; y: number }): void {
		const depth = this.size / 2 - ((this.x - foot.x) * nx + (this.y - foot.y) * ny);
		if (depth > 0) {
			this.x += nx * depth;
			this.y += ny * depth;
		}
		const into = this.vx * nx + this.vy * ny;
		if (into < 0) {
			this.vx -= 2 * into * nx;
			this.vy -= 2 * into * ny;
		}
	}

	/** What the dot is doing at its wall, for the view; nothing once it drifts free */
	contact(): Pick<DotView, "drip" | "launch"> {
		switch (this.stage) {
			case "forming":
				return {
					drip: {
						// It hangs from its foot, leaning off it
						wall: { nx: this.nx, ny: this.ny, x: this.footX, y: this.footY },
						progress: this.drip,
						prev: this.prevDrip,
						radius: this.fullSize / 2,
						heading: { vx: this.heading.vx, vy: this.heading.vy },
					},
				};
			case "launching":
				return {
					launch: { wall: this.wallContact(), progress: this.launch, prev: this.prevLaunch },
				};
			default:
				return {};
		}
	}

	private wallContact(): WallContact {
		// The foot slides along the wall under the dot
		const along = (this.x - this.footX) * this.nx + (this.y - this.footY) * this.ny;
		return {
			nx: this.nx,
			ny: this.ny,
			x: this.x - this.nx * along,
			y: this.y - this.ny * along,
		};
	}
}
