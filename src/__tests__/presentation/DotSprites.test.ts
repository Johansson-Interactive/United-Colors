import {
	type SceneKind,
	sceneLength,
	setMerge,
	setStretch,
	setWall,
	writeDot,
} from "../../application/sceneRecord";
import {
	BODY_PX,
	BODY_SPRITE,
	type DotSprites,
	dotSprites,
	GLARE_MAX_DISTANCE,
	GLARE_STEPS,
	glareCell,
	glareOffset,
	glareStepDistance,
	HALO_PX,
	HALO_SCALE,
	HALO_SPRITE,
	packDotSprites,
	SHEET_HEIGHT,
	SHEET_WIDTH,
	type SheetCell,
	type SpritePlacement,
} from "../../presentation/dotSprites";

const COLORS = [
	Float32Array.of(1, 0, 0, 1),
	Float32Array.of(0, 1, 0, 1),
	Float32Array.of(0, 0, 1, 1),
];

interface Dot {
	kind: SceneKind;
	x: number;
	y: number;
	radius: number;
	color?: number;
}

function sceneOf(dots: Dot[]): Float32Array {
	const scene = new Float32Array(sceneLength(dots.length));
	dots.forEach((d, i) => {
		writeDot(scene, i, d.kind, d.x, d.y, d.radius, d.color ?? 0);
	});
	return scene;
}

/** Where a placement puts the point (u, v) of its cell, as Skia applies an RSXform */
function place(p: SpritePlacement, u: number, v: number): [number, number] {
	return [p.scos * u - p.ssin * v + p.tx, p.ssin * u + p.scos * v + p.ty];
}

function centre(cell: SheetCell): [number, number] {
	return [cell.width / 2, cell.height / 2];
}

function packed(scene: Float32Array, gx = 0, gy = 0, out: DotSprites = dotSprites()): DotSprites {
	packDotSprites(scene, gx, gy, COLORS, out);
	return out;
}

const PLAIN: Dot = { kind: "small", x: 40, y: 70, radius: 12, color: 2 };

describe("packDotSprites", () => {
	it("draws a plain small dot as a halo, a body and a glare, in its colour", () => {
		const { halos, bodies, glares } = packed(sceneOf([PLAIN]));
		expect([halos.count, bodies.count, glares.count]).toEqual([1, 1, 1]);
		expect(halos.colors[1][0]).toBe(COLORS[2]);
		expect(bodies.colors[1][0]).toBe(COLORS[2]);
		expect(halos.cells[1][0]).toBe(HALO_SPRITE);
		expect(bodies.cells[1][0]).toBe(BODY_SPRITE);
	});

	it("centres the body on the dot at its radius", () => {
		const body = packed(sceneOf([PLAIN])).bodies.placements[1][0];
		const [cx, cy] = centre(BODY_SPRITE);
		const [x, y] = place(body, cx, cy);
		expect(x).toBeCloseTo(PLAIN.x, 5);
		expect(y).toBeCloseTo(PLAIN.y, 5);
		const [ex, ey] = place(body, cx + BODY_PX, cy);
		expect(Math.hypot(ex - x, ey - y)).toBeCloseTo(PLAIN.radius, 5);
	});

	it("centres the halo on the dot at the halo's size", () => {
		const halo = packed(sceneOf([PLAIN])).halos.placements[1][0];
		const [cx, cy] = centre(HALO_SPRITE);
		const [x, y] = place(halo, cx, cy);
		expect([x, y]).toEqual([PLAIN.x, PLAIN.y]);
		const [ex] = place(halo, cx + HALO_PX, cy);
		expect(ex - x).toBeCloseTo(PLAIN.radius * HALO_SCALE, 5);
	});

	it("turns the glare toward the light, where drawScene puts it", () => {
		const step = GLARE_MAX_DISTANCE / (GLARE_STEPS - 1);
		for (const [lightX, lightY] of [
			[0, 0],
			[0.6, -0.3],
			[-1, 1],
			[2, 2],
		]) {
			const gx = glareOffset(lightX);
			const gy = glareOffset(lightY);
			const sprites = packed(sceneOf([PLAIN]), gx, gy);
			const glare = sprites.glares.placements[1][0];
			const cell = sprites.glares.cells[1][0];
			const index = sprites.glareCells.indexOf(cell);
			expect(index).toBeGreaterThanOrEqual(0);
			const [cx, cy] = centre(cell);
			// The dot's centre stays put, and the glare's centre lands on the light's spot
			const [x, y] = place(glare, cx, cy);
			expect(x).toBeCloseTo(PLAIN.x, 5);
			expect(y).toBeCloseTo(PLAIN.y, 5);
			const [lx, ly] = place(glare, cx + glareStepDistance(index) * BODY_PX, cy);
			const miss = Math.hypot(
				lx - (PLAIN.x + gx * PLAIN.radius),
				ly - (PLAIN.y + gy * PLAIN.radius),
			);
			expect(miss).toBeLessThanOrEqual((step / 2) * PLAIN.radius + 1e-6);
		}
	});

	it("gives the player nothing, and other dots a halo but not a sprite body", () => {
		const scene = sceneOf([
			{ kind: "player", x: 100, y: 100, radius: 25 },
			{ kind: "point", x: 10, y: 10, radius: 25 },
			{ kind: "small", x: 20, y: 20, radius: 12 },
			{ kind: "small", x: 30, y: 30, radius: 12 },
			{ kind: "rejected", x: 40, y: 40, radius: 12 },
		]);
		setStretch(scene, 2, 0.2, 0);
		setWall(scene, 3, 0, { nx: 1, ny: 0, x: 0, y: 30 });
		const { halos, bodies, glares } = packed(scene);
		expect(halos.count).toBe(4);
		expect([bodies.count, glares.count]).toEqual([0, 0]);
	});

	it("shrinks a merging dot's halo as it slides in, and drops it once it is in", () => {
		const scene = sceneOf([
			{ kind: "merging", x: 0, y: 0, radius: 10 },
			{ kind: "merging", x: 0, y: 0, radius: 10 },
		]);
		setMerge(scene, 0, 0.25);
		setMerge(scene, 1, 1);
		const { halos } = packed(scene);
		expect(halos.count).toBe(1);
		expect(halos.placements[1][0].scos * HALO_PX).toBeCloseTo(10 * HALO_SCALE * 0.75, 5);
	});

	it("skips dots with no size", () => {
		const { halos, bodies } = packed(sceneOf([{ ...PLAIN, radius: 0 }]));
		expect([halos.count, bodies.count]).toEqual([0, 0]);
	});

	it("reuses its arrays and objects from frame to frame", () => {
		const out = dotSprites();
		packed(sceneOf([PLAIN, PLAIN]), 0, 0, out);
		const placements = out.bodies.placements[2];
		const first = placements[0];
		packed(sceneOf([PLAIN]), 0, 0, out);
		packed(sceneOf([{ ...PLAIN, x: 5 }, PLAIN]), 0.3, 0.1, out);
		expect(out.bodies.placements[2]).toBe(placements);
		expect(out.bodies.placements[2][0]).toBe(first);
		expect(first.tx).not.toBe(PLAIN.x - (PLAIN.radius / BODY_PX) * (BODY_SPRITE.width / 2));
		expect(out.bodies.placements[2]).toHaveLength(2);
		expect(out.bodies.colors[2]).toHaveLength(2);
		expect(out.glares.cells[2]).toHaveLength(2);
	});
});

describe("the sprite sheet", () => {
	it("lays the cells out side by side within the sheet", () => {
		const cells = [HALO_SPRITE, BODY_SPRITE];
		for (let step = 0; step < GLARE_STEPS; step++) cells.push(glareCell(step));
		for (const a of cells) {
			expect(a.x).toBeGreaterThanOrEqual(0);
			expect(a.y).toBeGreaterThanOrEqual(0);
			expect(a.x + a.width).toBeLessThanOrEqual(SHEET_WIDTH);
			expect(a.y + a.height).toBeLessThanOrEqual(SHEET_HEIGHT);
			for (const b of cells) {
				if (a === b) continue;
				const apart =
					a.x + a.width <= b.x ||
					b.x + b.width <= a.x ||
					a.y + a.height <= b.y ||
					b.y + b.height <= a.y;
				expect(apart).toBe(true);
			}
		}
	});

	it("holds every glare distance the light can reach", () => {
		expect(glareStepDistance(0)).toBe(0);
		expect(glareStepDistance(GLARE_STEPS - 1)).toBeCloseTo(GLARE_MAX_DISTANCE, 10);
		for (const light of [-5, -1, 0, 1, 5]) {
			expect(Math.hypot(glareOffset(light), glareOffset(-light))).toBeLessThanOrEqual(
				GLARE_MAX_DISTANCE + 1e-9,
			);
		}
	});
});
