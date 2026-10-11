let nextId = 0;

/** A moving dot in the game world */
export class Dot {
	readonly id: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	color: string;
	velocity: number;
	/** Size at the start of the current tick, for interpolating size changes between ticks */
	prevSize: number;
	private _size: number;
	private _flaggedForRemoval = false;

	constructor(
		x: number,
		y: number,
		vx: number,
		vy: number,
		color: string,
		size: number,
		velocity: number,
	) {
		this.id = `dot-${nextId++}`;
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

	update(_timeStep: number): void {
		this.x += this.vx * this.velocity;
		this.y += this.vy * this.velocity;
	}

	flagForRemoval(): void {
		this._flaggedForRemoval = true;
	}

	get isFlaggedForRemoval(): boolean {
		return this._flaggedForRemoval;
	}
}

/** Reset ID counter (for testing) */
export function resetDotIdCounter(): void {
	nextId = 0;
}
