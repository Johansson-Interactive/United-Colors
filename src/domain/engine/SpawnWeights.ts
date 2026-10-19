/**
 * A rectangle split into square cells, each with a weight, for picking random points that
 * favour some parts of it over others. A cell's chance of being picked is its area (edge cells
 * are clipped to the rectangle) times its weight, or nothing while it is blocked. Weights start
 * at 1 and never sink below `floor`.
 *
 * Everything lives in typed arrays laid out once, so picking allocates nothing.
 */
export class SpawnWeights {
	private readonly left: number;
	private readonly top: number;
	private readonly right: number;
	private readonly bottom: number;
	private readonly cell: number;
	private readonly cols: number;
	private readonly floor: number;
	private readonly area: Float64Array;
	private readonly weight: Float64Array;
	private readonly blocked: Uint8Array;
	/** Running sum of the cells' masses, filled in by each pick */
	private readonly cumulative: Float64Array;

	constructor(
		left: number,
		top: number,
		width: number,
		height: number,
		cell: number,
		floor: number,
	) {
		this.left = left;
		this.top = top;
		this.right = left + Math.max(0, width);
		this.bottom = top + Math.max(0, height);
		this.cell = cell;
		this.floor = floor;
		this.cols = Math.max(1, Math.ceil(width / cell));
		const rows = Math.max(1, Math.ceil(height / cell));
		const count = this.cols * rows;
		this.area = new Float64Array(count);
		this.weight = new Float64Array(count);
		this.blocked = new Uint8Array(count);
		this.cumulative = new Float64Array(count);
		for (let i = 0; i < count; i++) {
			this.area[i] = Math.max(0, this.x1(i) - this.x0(i)) * Math.max(0, this.y1(i) - this.y0(i));
		}
		this.clear();
	}

	/** Every weight back to 1, nothing blocked */
	clear(): void {
		this.weight.fill(1);
		this.blocked.fill(0);
	}

	/** Move every weight `fraction` of the way back to 1 */
	recover(fraction: number): void {
		for (let i = 0; i < this.weight.length; i++) {
			this.weight[i] += (1 - this.weight[i]) * fraction;
		}
	}

	/**
	 * Block every cell whose rectangle touches the circle at (`x`, `y`) of `radius`, and unblock
	 * the rest: every point a pick can land on is then farther than `radius` from the centre
	 */
	block(x: number, y: number, radius: number): void {
		const r2 = radius * radius;
		for (let i = 0; i < this.area.length; i++) {
			const dx = Math.max(this.x0(i) - x, 0, x - this.x1(i));
			const dy = Math.max(this.y0(i) - y, 0, y - this.y1(i));
			this.blocked[i] = dx * dx + dy * dy <= r2 ? 1 : 0;
		}
	}

	/**
	 * A random point into `out`: a cell by its mass, then a uniform point in it. Always draws
	 * three numbers from `random`, so a run's later draws don't hang on what was free. False,
	 * leaving `out` alone, if every cell is blocked or has no area.
	 */
	pick(random: () => number, out: { x: number; y: number }): boolean {
		const roll = random();
		const u = random();
		const v = random();

		let total = 0;
		for (let i = 0; i < this.area.length; i++) {
			if (!this.blocked[i]) total += this.area[i] * this.weight[i];
			this.cumulative[i] = total;
		}
		if (total <= 0) return false;

		// The first cell whose running sum passes the roll; one with no mass never does
		const target = roll * total;
		let chosen = this.area.length - 1;
		for (let i = 0; i < this.area.length; i++) {
			if (this.cumulative[i] > target) {
				chosen = i;
				break;
			}
		}
		// A roll of almost 1 can pass every sum by rounding: take the last cell with mass
		while (this.blocked[chosen] || this.area[chosen] * this.weight[chosen] <= 0) chosen--;

		out.x = this.x0(chosen) + u * (this.x1(chosen) - this.x0(chosen));
		out.y = this.y0(chosen) + v * (this.y1(chosen) - this.y0(chosen));
		return true;
	}

	/**
	 * Lower the weights of the cells centred within `radius` of (`x`, `y`), blocked or not, by
	 * up to `strength` of the way down to the floor: all of that at the point, easing off
	 * smoothly to nothing at `radius`
	 */
	suppress(x: number, y: number, radius: number, strength: number): void {
		const r2 = radius * radius;
		for (let i = 0; i < this.weight.length; i++) {
			const dx = (this.x0(i) + this.x1(i)) / 2 - x;
			const dy = (this.y0(i) + this.y1(i)) / 2 - y;
			const d2 = dx * dx + dy * dy;
			if (d2 >= r2) continue;
			const t = 1 - d2 / r2;
			const kernel = t * t;
			this.weight[i] = this.floor + (this.weight[i] - this.floor) * (1 - strength * kernel);
		}
	}

	private x0(i: number): number {
		return this.left + (i % this.cols) * this.cell;
	}

	private x1(i: number): number {
		return Math.min(this.right, this.x0(i) + this.cell);
	}

	private y0(i: number): number {
		return this.top + Math.floor(i / this.cols) * this.cell;
	}

	private y1(i: number): number {
		return Math.min(this.bottom, this.y0(i) + this.cell);
	}
}
