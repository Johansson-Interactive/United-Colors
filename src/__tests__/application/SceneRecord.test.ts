import {
	dotCount,
	dotKind,
	FIELD,
	findDent,
	findPlayer,
	HAS_WALL_SKSL,
	hasWall,
	KIND_CODE,
	playerDisc,
	readDot,
	readScene,
	type SceneKind,
	sceneDot,
	sceneLength,
	setDent,
	setMerge,
	setNeck,
	setStretch,
	setWall,
	setYolk,
	writeDot,
} from "../../application/sceneRecord";

function sceneOf(kinds: SceneKind[]): Float32Array {
	const scene = new Float32Array(sceneLength(kinds.length));
	kinds.forEach((kind, i) => {
		writeDot(scene, i, kind, i * 10, i * 20, 5 + i, i);
	});
	return scene;
}

describe("the scene record", () => {
	it("gives the drawer the same fields readDot reads", () => {
		const scene = sceneOf(["small", "point", "player", "merging", "rejected"]);
		setMerge(scene, 3, 0.4);
		setStretch(scene, 1, 0.2, -0.1);
		setWall(scene, 0, 0, { x: 0, y: 30, nx: 0, ny: 1 });
		for (let i = 0; i < dotCount(scene); i++) {
			const dot = readDot(scene, i, sceneDot());
			const o = i * FIELD.STRIDE;
			expect(scene[o + FIELD.X]).toBe(dot.x);
			expect(scene[o + FIELD.Y]).toBe(dot.y);
			expect(scene[o + FIELD.RADIUS]).toBe(dot.radius);
			expect(scene[o + FIELD.COLOR]).toBe(dot.color);
			expect(scene[o + FIELD.KIND]).toBe(KIND_CODE[dot.kind]);
			expect(scene[o + FIELD.MERGE]).toBeCloseTo(dot.merge);
			expect(scene[o + FIELD.STRETCH_X]).toBeCloseTo(dot.stretchX);
			expect(scene[o + FIELD.STRETCH_Y]).toBeCloseTo(dot.stretchY);
			expect(scene[o + FIELD.WALL_X]).toBe(dot.wallX);
			expect(scene[o + FIELD.WALL_Y]).toBe(dot.wallY);
		}
		expect(sceneLength(1)).toBe(FIELD.STRIDE);
	});

	it("reads back each dot as it was written, by index", () => {
		const scene = sceneOf(["small", "point", "player", "merging", "rejected"]);
		expect(dotCount(scene)).toBe(5);
		expect(readScene(scene).map((d) => d.kind)).toEqual([
			"small",
			"point",
			"player",
			"merging",
			"rejected",
		]);
		expect(dotKind(scene, 3)).toBe("merging");
		expect(readDot(scene, 2, sceneDot())).toMatchObject({ x: 20, y: 40, radius: 7, color: 2 });
	});

	it("reads each kind's own fields back", () => {
		const scene = sceneOf(["merging", "rejected", "point", "player", "small"]);
		setMerge(scene, 0, 0.25);
		setDent(scene, 1, 0.75);
		setYolk(scene, 2, 3, -2, 1);
		setStretch(scene, 2, 0.5, 0);
		setStretch(scene, 3, 0.125, -0.25, 3);
		setWall(scene, 3, 0, { nx: 1, ny: 0, x: 0, y: 100 });
		setWall(scene, 3, 1, { nx: 0, ny: -1, x: 100, y: 800 });
		setNeck(scene, 3, 4);
		const [merging, rejected, point, player, small] = readScene(scene);
		expect(merging.merge).toBe(0.25);
		expect(rejected.dent).toBe(0.75);
		expect(point).toMatchObject({ core: 3, coreX: -2, coreY: 1, stretchX: 0.5, stretchY: 0 });
		expect(point.wobble).toBe(0);
		expect(player).toMatchObject({ stretchX: 0.125, stretchY: -0.25, wobble: 3, neck: 4 });
		expect(player).toMatchObject({ wallX: 1, wallY: 0, wallC: 0 });
		expect(player).toMatchObject({ wall2X: 0, wall2Y: -1, wall2C: -800 });
		expect(small).toEqual({ ...sceneDot(), kind: "small", x: 40, y: 80, radius: 9, color: 4 });
	});

	it("clears every extra field when a dot is written over an earlier one", () => {
		const scene = sceneOf(["player"]);
		setMerge(scene, 0, 1);
		setDent(scene, 0, 1);
		setYolk(scene, 0, 2, 3, 4);
		setStretch(scene, 0, 0.1, 0.2, 5);
		setWall(scene, 0, 0, { nx: 1, ny: 0, x: 0, y: 0 });
		setWall(scene, 0, 1, { nx: 0, ny: 1, x: 0, y: 0 });
		setNeck(scene, 0, 6);
		writeDot(scene, 0, "small", 1, 2, 3, 0);
		expect(readDot(scene, 0, sceneDot())).toEqual({
			...sceneDot(),
			kind: "small",
			x: 1,
			y: 2,
			radius: 3,
		});
	});

	it("leaves the dots either side alone", () => {
		const scene = sceneOf(["small", "small", "small"]);
		setNeck(scene, 1, 9);
		writeDot(scene, 1, "point", 0, 0, 1, 0);
		expect(readScene(scene).map((d) => [d.x, d.neck])).toEqual([
			[0, 0],
			[0, 0],
			[20, 0],
		]);
	});

	it("finds the player wherever it is in the scene, and none in a kiosk scene", () => {
		expect(findPlayer(sceneOf(["player", "small"]))).toBe(0);
		expect(findPlayer(sceneOf(["small", "merging", "player"]))).toBe(2);
		expect(findPlayer(sceneOf(["small", "point"]))).toBe(-1);
		expect(findPlayer(new Float32Array(0))).toBe(-1);
	});

	it("gives where the player is drawn, how big and how stretched, for what is drawn around it on screen", () => {
		const scene = new Float32Array(sceneLength(2));
		writeDot(scene, 0, "small", 10, 20, 4, 1);
		writeDot(scene, 1, "player", 120, 340, 18, 2);
		expect(playerDisc(scene)).toEqual({ x: 120, y: 340, radius: 18, stretchX: 0, stretchY: 0 });
		setStretch(scene, 1, 0.125, -0.25);
		expect(playerDisc(scene)).toMatchObject({ stretchX: 0.125, stretchY: -0.25 });
	});

	it("gives no player disc for a scene without the player", () => {
		expect(playerDisc(sceneOf(["small", "point"]))).toBeNull();
		expect(playerDisc(new Float32Array(0))).toBeNull();
	});

	it("has at most one refused dot denting the player: the first", () => {
		expect(findDent(sceneOf(["player", "small"]))).toBe(-1);
		expect(findDent(sceneOf(["small", "rejected", "player", "rejected"]))).toBe(1);
	});

	it("judges a zero wall normal as no wall, and a unit one as a wall", () => {
		expect(hasWall(0, 0)).toBe(false);
		expect(hasWall(1, 0)).toBe(true);
		expect(hasWall(0, -1)).toBe(true);
		const scene = sceneOf(["small"]);
		const before = readDot(scene, 0, sceneDot());
		expect(hasWall(before.wallX, before.wallY)).toBe(false);
		expect(hasWall(before.wall2X, before.wall2Y)).toBe(false);
		setWall(scene, 0, 1, { nx: -1, ny: 0, x: 400, y: 0 });
		const after = readDot(scene, 0, sceneDot());
		expect(hasWall(after.wallX, after.wallY)).toBe(false);
		expect(hasWall(after.wall2X, after.wall2Y)).toBe(true);
		expect(after.wall2C).toBe(-400);
	});

	it("gives the shaders the same wall test", () => {
		expect(HAS_WALL_SKSL).toContain("bool hasWall(float3 wall)");
		expect(HAS_WALL_SKSL).toContain("abs(wall.x) + abs(wall.y) >= 0.5");
	});
});
