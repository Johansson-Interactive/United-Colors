import type { WallContact } from "../domain/types";

/**
 * The drawable scene: a flat Float32Array with one fixed-size record per dot, so one
 * typed-array copy crosses to the UI thread per frame instead of an object per dot. This
 * module alone knows the record's layout: the scene builder writes dots through it, and the
 * drawer and the shader packing read them back through it, by index (0 for the first dot).
 *
 * The read side runs on the UI thread too, so it is plain worklet functions with no state; the
 * write side (writeDot and the set* functions) is for the scene builder on the JS thread.
 */

const X = 0;
const Y = 1;
const RADIUS = 2;
const COLOR = 3;
const KIND = 4;
const MERGE = 5;
const STRETCH_X = 6;
const STRETCH_Y = 7;
const WOBBLE = 8;
const DENT = 9;
const CORE = 10;
const CORE_X = 11;
const CORE_Y = 12;
const WALL_X = 13;
const WALL_Y = 14;
const WALL_C = 15;
const WALL2_X = 16;
const WALL2_Y = 17;
const WALL2_C = 18;
const NECK = 19;
const STRIDE = 20;

/**
 * What a dot is drawn as. A merging dot is a caught dot sliding into the player, drawn as one
 * liquid body with it; a rejected dot is the wrong-colour dot the player is refusing, which
 * dents the player's liquid.
 */
export type SceneKind = "small" | "point" | "player" | "merging" | "rejected";

/** Kinds by their code in the record */
const KINDS: readonly SceneKind[] = ["small", "point", "player", "merging", "rejected"];

/**
 * A wall normal shorter than this (in the L1 norm) is no wall. A real one is a unit normal,
 * so this tells the two apart without comparing floats to zero.
 */
export const WALL_NORMAL_MIN = 0.5;

/**
 * Where each field sits in a dot's record (offsets from the record's start), and the record's
 * length. For the drawer's per-dot loops on the UI thread: there, calling a worklet such as
 * readDot allocates on every call, enough at sixty dots to set off a garbage collection
 * nearly every frame, while indexing the array directly allocates nothing. Everywhere else,
 * use readDot.
 */
export const FIELD = {
	X,
	Y,
	RADIUS,
	COLOR,
	KIND,
	MERGE,
	STRETCH_X,
	STRETCH_Y,
	WALL_X,
	WALL_Y,
	STRIDE,
} as const;

/** The code each kind is stored as in the record's KIND field (see FIELD) */
export const KIND_CODE: Readonly<Record<SceneKind, number>> = {
	small: KINDS.indexOf("small"),
	point: KINDS.indexOf("point"),
	player: KINDS.indexOf("player"),
	merging: KINDS.indexOf("merging"),
	rejected: KINDS.indexOf("rejected"),
};

/** The kind whose code is `code` in the record */
function kindOf(code: number): SceneKind {
	"worklet";
	return KINDS[code];
}

/** The code `kind` is stored as in the record */
function codeOf(kind: SceneKind): number {
	"worklet";
	return KINDS.indexOf(kind);
}

/** Whether a wall slot with normal (`nx`, `ny`) holds a wall: a zero normal is none */
export function hasWall(nx: number, ny: number): boolean {
	"worklet";
	return Math.abs(nx) + Math.abs(ny) >= WALL_NORMAL_MIN;
}

/** SkSL `hasWall(float3 wall)`: the same test as hasWall, on a packed wall (x, y, offset) */
export const HAS_WALL_SKSL = `
bool hasWall(float3 wall) {
	return abs(wall.x) + abs(wall.y) >= ${WALL_NORMAL_MIN.toFixed(1)};
}
`;

/** One dot of the scene, decoded */
export interface SceneDot {
	kind: SceneKind;
	x: number;
	y: number;
	radius: number;
	/** Index into GAME_COLORS. For a point dot, its shell: the player's own colour */
	color: number;
	/** For a merging dot: how far its slide into the player has come, 0..1; 0 otherwise */
	merge: number;
	/**
	 * For a rejected dot: how soft the dent it presses into the player is, 1 while it presses
	 * and falling to 0 as it is pushed clear (so no dent is left once it is out); 0 otherwise
	 */
	dent: number;
	/**
	 * For a point dot: the GAME_COLORS index of its yolk, the colour the player turns into on
	 * catching it; -1 for no yolk
	 */
	core: number;
	/** For a point dot: where its yolk sits, as an offset (px) from its centre before any lean */
	coreX: number;
	coreY: number;
	/**
	 * How the dot is drawn out: a long-axis vector whose length is the stretch fraction, drawn
	 * as an area-preserving ellipse along it. What draws it out depends on the dot:
	 * - the player: its liquid jelly (see jelly.ts), with a squash from a refused dot added in;
	 * - a point dot: its lean toward the player (see lean.ts);
	 * - a small dot forming as a drip: the heading it will shoot off on (see wall.ts);
	 * - a small dot just launched off a wall: drawn out along its flight as it tears free.
	 * 0 for any other dot.
	 */
	stretchX: number;
	stretchY: number;
	/** For the player: its jelly's wobble clock (seconds); 0 otherwise */
	wobble: number;
	/**
	 * The wall the dot is in contact with (and a second, for the player in a corner): the unit
	 * normal from the wall into the screen, and the wall's offset along it, so a point p is on
	 * the screen side where p . n - c > 0. A zero normal is no wall (see hasWall). A body is
	 * cut off at its walls and, with a neck, joined to them by a wet fillet.
	 */
	wallX: number;
	wallY: number;
	wallC: number;
	wall2X: number;
	wall2Y: number;
	wall2C: number;
	/** Width (px) of the fillet joining the body to its walls (a smooth-min radius); 0 is dry */
	neck: number;
}

/** A blank dot to read into (see readDot) */
export function sceneDot(): SceneDot {
	"worklet";
	return {
		kind: "small",
		x: 0,
		y: 0,
		radius: 0,
		color: 0,
		merge: 0,
		dent: 0,
		core: -1,
		coreX: 0,
		coreY: 0,
		stretchX: 0,
		stretchY: 0,
		wobble: 0,
		wallX: 0,
		wallY: 0,
		wallC: 0,
		wall2X: 0,
		wall2Y: 0,
		wall2C: 0,
		neck: 0,
	};
}

/** Floats a scene of `count` dots takes */
export function sceneLength(count: number): number {
	"worklet";
	return count * STRIDE;
}

/** How many dots `scene` holds */
export function dotCount(scene: Float32Array): number {
	"worklet";
	return Math.floor(scene.length / STRIDE);
}

/** The kind of the dot at `index` */
export function dotKind(scene: Float32Array, index: number): SceneKind {
	"worklet";
	return kindOf(scene[index * STRIDE + KIND]);
}

/** Decode the dot at `index` into `out`, and return it */
export function readDot(scene: Float32Array, index: number, out: SceneDot): SceneDot {
	"worklet";
	const o = index * STRIDE;
	out.kind = kindOf(scene[o + KIND]);
	out.x = scene[o + X];
	out.y = scene[o + Y];
	out.radius = scene[o + RADIUS];
	out.color = scene[o + COLOR];
	out.merge = scene[o + MERGE];
	out.dent = scene[o + DENT];
	out.core = scene[o + CORE];
	out.coreX = scene[o + CORE_X];
	out.coreY = scene[o + CORE_Y];
	out.stretchX = scene[o + STRETCH_X];
	out.stretchY = scene[o + STRETCH_Y];
	out.wobble = scene[o + WOBBLE];
	out.wallX = scene[o + WALL_X];
	out.wallY = scene[o + WALL_Y];
	out.wallC = scene[o + WALL_C];
	out.wall2X = scene[o + WALL2_X];
	out.wall2Y = scene[o + WALL2_Y];
	out.wall2C = scene[o + WALL2_C];
	out.neck = scene[o + NECK];
	return out;
}

/** Every dot in `scene`, decoded into fresh objects (for tests and debugging, not per frame) */
export function readScene(scene: Float32Array): SceneDot[] {
	const dots: SceneDot[] = [];
	for (let i = 0; i < dotCount(scene); i++) dots.push(readDot(scene, i, sceneDot()));
	return dots;
}

/** Index of the first dot of `kind` in `scene`, or -1 when there is none */
function findKind(scene: Float32Array, kind: SceneKind): number {
	"worklet";
	const code = codeOf(kind);
	const count = dotCount(scene);
	for (let i = 0; i < count; i++) if (scene[i * STRIDE + KIND] === code) return i;
	return -1;
}

/** Index of the player in `scene`, or -1 when it has none (kiosk) */
export function findPlayer(scene: Float32Array): number {
	"worklet";
	return findKind(scene, "player");
}

/** Where a dot is drawn on screen, and how big */
export interface Disc {
	x: number;
	y: number;
	radius: number;
}

/**
 * Where the player is drawn in `scene`, and how big, for what the interface draws around it
 * (Get ready's ring and outline); null when the scene has no player (kiosk)
 */
export function playerDisc(scene: Float32Array): Disc | null {
	"worklet";
	const index = findPlayer(scene);
	if (index < 0) return null;
	const o = index * STRIDE;
	return { x: scene[o + X], y: scene[o + Y], radius: scene[o + RADIUS] };
}

/**
 * Index of the refused dot that dents the player, or -1 for none. At most one does: should
 * the scene hold more than one rejected dot, only the first dents the liquid.
 */
export function findDent(scene: Float32Array): number {
	"worklet";
	return findKind(scene, "rejected");
}

/**
 * Write the dot at `index`: its kind, where it is drawn and its colour (a GAME_COLORS
 * index). Every other field is cleared, to no merge, dent, yolk, stretch or wall, so a
 * record never keeps what an earlier frame wrote there; the set* functions then add the
 * fields its kind uses.
 */
export function writeDot(
	scene: Float32Array,
	index: number,
	kind: SceneKind,
	x: number,
	y: number,
	radius: number,
	color: number,
): void {
	const o = index * STRIDE;
	scene[o + X] = x;
	scene[o + Y] = y;
	scene[o + RADIUS] = radius;
	scene[o + COLOR] = color;
	scene[o + KIND] = codeOf(kind);
	scene.fill(0, o + MERGE, o + STRIDE);
	scene[o + CORE] = -1;
}

/** A merging dot's slide into the player, 0..1 (see SceneDot.merge) */
export function setMerge(scene: Float32Array, index: number, slide: number): void {
	scene[index * STRIDE + MERGE] = slide;
}

/** A rejected dot's dent softness, 0..1 (see SceneDot.dent) */
export function setDent(scene: Float32Array, index: number, dent: number): void {
	scene[index * STRIDE + DENT] = dent;
}

/** A point dot's yolk: its colour and offset from the centre (see SceneDot.core) */
export function setYolk(
	scene: Float32Array,
	index: number,
	core: number,
	offsetX: number,
	offsetY: number,
): void {
	const o = index * STRIDE;
	scene[o + CORE] = core;
	scene[o + CORE_X] = offsetX;
	scene[o + CORE_Y] = offsetY;
}

/** How the dot is drawn out, and for the player its wobble clock (see SceneDot.stretchX) */
export function setStretch(
	scene: Float32Array,
	index: number,
	stretchX: number,
	stretchY: number,
	wobble = 0,
): void {
	const o = index * STRIDE;
	scene[o + STRETCH_X] = stretchX;
	scene[o + STRETCH_Y] = stretchY;
	scene[o + WOBBLE] = wobble;
}

/** Put `wall` in the dot's first or second wall slot (see SceneDot.wallX) */
export function setWall(scene: Float32Array, index: number, slot: 0 | 1, wall: WallContact): void {
	const base = index * STRIDE + (slot === 0 ? WALL_X : WALL2_X);
	scene[base] = wall.nx;
	scene[base + 1] = wall.ny;
	scene[base + 2] = wall.nx * wall.x + wall.ny * wall.y;
}

/** The fillet joining the dot to its walls (see SceneDot.neck) */
export function setNeck(scene: Float32Array, index: number, neck: number): void {
	scene[index * STRIDE + NECK] = neck;
}
