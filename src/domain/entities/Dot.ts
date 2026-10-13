import { ABSORB_TICKS, REJECT_TICKS } from "../constants";
import type { Circle, DotKind } from "../types";

/** A moving dot in the game world */
export class Dot {
	readonly id: string;
	readonly kind: DotKind;
	x: number;
	y: number;
	vx: number;
	vy: number;
	color: string;
	velocity: number;
	/** Size at the start of the current tick, for interpolating size changes between ticks */
	prevSize: number;
	/**
	 * Progress of the merge into the player, 0..1, once caught; stays 0 otherwise.
	 * `prevAbsorb` is the value at the start of the tick, for interpolating between ticks.
	 */
	absorb = 0;
	prevAbsorb = 0;
	/** Progress of the player refusing this dot, 0..1, once it has ended the game; else 0 */
	reject = 0;
	prevReject = 0;
	private _size: number;
	private _absorbing = false;
	private absorbTicks = 0;
	private _rejecting = false;
	private rejectTicks = 0;
	private _flaggedForRemoval = false;

	constructor(
		id: string,
		x: number,
		y: number,
		vx: number,
		vy: number,
		color: string,
		size: number,
		velocity: number,
		kind: DotKind = "small",
	) {
		this.id = id;
		this.kind = kind;
		this.x = x;
		this.y = y;
		this.vx = vx;
		this.vy = vy;
		this.color = color;
		this._size = size;
		this.prevSize = size;
		this.velocity = velocity;
	}

	get size(): number {
		return this._size;
	}

	setSize(size: number): void {
		this._size = size;
	}

	/** Remember this tick's starting values, for interpolating between this tick and the next */
	beginTick(): void {
		this.prevSize = this._size;
		this.prevAbsorb = this.absorb;
		this.prevReject = this.reject;
	}

	/**
	 * Where the dot is `alpha` (0..1) of a tick after the last one, for catching it between
	 * ticks: carried on along its velocity. Written to `out`, so it allocates nothing.
	 */
	circleAt(alpha: number, out: Circle): Circle {
		out.x = this.x + this.vx * this.velocity * alpha;
		out.y = this.y + this.vy * this.velocity * alpha;
		out.radius = this._size / 2;
		return out;
	}

	/** A drip still forming on its wall: not yet in play, see SmallDot */
	get isForming(): boolean {
		return false;
	}

	update(_timeStep: number): void {
		if (this._absorbing) {
			this.absorbTicks = Math.min(ABSORB_TICKS, this.absorbTicks + 1);
			this.absorb = this.absorbTicks / ABSORB_TICKS;
			if (this.absorbTicks === ABSORB_TICKS) this.flagForRemoval();
			return;
		}
		if (this._rejecting) {
			this.rejectTicks = Math.min(REJECT_TICKS, this.rejectTicks + 1);
			this.reject = this.rejectTicks / REJECT_TICKS;
			return;
		}
		this.x += this.vx * this.velocity;
		this.y += this.vy * this.velocity;
	}

	/**
	 * The player caught this dot: it stops where it is and merges into the player over
	 * ABSORB_TICKS, after which it is flagged for removal. Idempotent.
	 */
	startAbsorb(): void {
		if (this._absorbing) return;
		this._absorbing = true;
		this.absorbTicks = 0;
		this.absorb = 0;
		this.prevAbsorb = 0;
		this.vx = 0;
		this.vy = 0;
	}

	/**
	 * The player touched this dot with the wrong colour: it stops where it is while the player
	 * refuses it over REJECT_TICKS (see `reject`). Idempotent.
	 */
	startReject(): void {
		if (this._rejecting) return;
		this._rejecting = true;
		this.rejectTicks = 0;
		this.reject = 0;
		this.prevReject = 0;
		this.vx = 0;
		this.vy = 0;
	}

	get isRejecting(): boolean {
		return this._rejecting;
	}

	/** Caught and merging into the player; no longer part of play */
	get isAbsorbing(): boolean {
		return this._absorbing;
	}

	flagForRemoval(): void {
		this._flaggedForRemoval = true;
	}

	get isFlaggedForRemoval(): boolean {
		return this._flaggedForRemoval;
	}
}
