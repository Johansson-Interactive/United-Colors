import {
	angleBetween,
	FLAT_DOWN,
	FLAT_UP,
	gravityAt,
	levelTilt,
	tiltFrom,
	unitGravity,
} from "../../domain/levelPose";
import type { Gravity } from "../../domain/types";

const DEG = Math.PI / 180;

/** Gravity with the phone's top edge tipped `pitch` towards you and its right edge `roll` down, from flat */
function heldUp(pitch: number, roll: number): Gravity {
	return gravityAt({ x: roll, y: pitch }, FLAT_UP);
}

/** Level poses players hold: at a desk, propped in bed, upright, on their side, overhead */
const POSES: Record<string, Gravity> = {
	flat: FLAT_UP,
	"at a desk": heldUp(40 * DEG, 0),
	"propped in bed": heldUp(75 * DEG, 0),
	upright: { x: 0, y: -1, z: 0 },
	"on your side": heldUp(0, 88 * DEG),
	"on your side, exactly": { x: 1, y: 0, z: 0 },
	"on your side, screen a little down": unitGravity({ x: 1, y: 0.1, z: 0.05 }),
	overhead: FLAT_DOWN,
	"overhead, tipped": unitGravity({ x: 0.3, y: 0.4, z: 0.85 }),
};

/** `g` turned by `angle` about `axis`, in the phone's axes */
function turned(g: Gravity, axis: Gravity, angle: number): Gravity {
	const k = unitGravity(axis);
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const dot = k.x * g.x + k.y * g.y + k.z * g.z;
	return {
		x: g.x * cos + (k.y * g.z - k.z * g.y) * sin + k.x * dot * (1 - cos),
		y: g.y * cos + (k.z * g.x - k.x * g.z) * sin + k.y * dot * (1 - cos),
		z: g.z * cos + (k.x * g.y - k.y * g.x) * sin + k.z * dot * (1 - cos),
	};
}

describe("tiltFrom", () => {
	it("the level pose itself reads as no tilt, in any pose", () => {
		for (const level of Object.values(POSES)) {
			const tilt = tiltFrom(level, level);
			expect(tilt.x).toBeCloseTo(0);
			expect(tilt.y).toBeCloseTo(0);
		}
	});

	it("screen up, reads the angles from flat as before", () => {
		// Right edge lowered by 0.4 rad: gravity leans to +x
		const right = tiltFrom({ x: Math.sin(0.4), y: 0, z: -Math.cos(0.4) }, FLAT_UP);
		expect(right.x).toBeCloseTo(0.4);
		expect(right.y).toBeCloseTo(0);
		// Top edge raised by 0.7 rad: gravity leans to -y
		const top = tiltFrom({ x: 0, y: -Math.sin(0.7), z: -Math.cos(0.7) }, FLAT_UP);
		expect(top.x).toBeCloseTo(0);
		expect(top.y).toBeCloseTo(0.7);
	});

	it("screen down, both axes are mirrored from screen up", () => {
		// Right edge lowered by 0.3 rad, as the player sees the screen
		expect(tiltFrom({ x: Math.sin(0.3), y: 0, z: Math.cos(0.3) }, FLAT_DOWN).x).toBeCloseTo(-0.3);
		// Top edge lowered by 0.3 rad
		expect(tiltFrom({ x: 0, y: Math.sin(0.3), z: Math.cos(0.3) }, FLAT_DOWN).y).toBeCloseTo(0.3);
	});

	it("reads how far gravity has turned, so jitter is never magnified, in any pose", () => {
		for (const [pose, level] of Object.entries(POSES)) {
			for (const axis of [
				{ x: 1, y: 0, z: 0 },
				{ x: 0, y: 1, z: 0 },
				{ x: 0, y: 0, z: 1 },
				{ x: 1, y: 1, z: 1 },
			]) {
				const shaken = turned(level, axis, 0.3 * DEG);
				const tilt = tiltFrom(shaken, level);
				expect(Math.hypot(tilt.x, tilt.y), pose).toBeCloseTo(angleBetween(shaken, level), 9);
			}
		}
	});

	it("on your side, turning the screen like a steering wheel steers", () => {
		const level = POSES["on your side, exactly"];
		// Gravity swings from the right edge towards the top edge: the top edge drops
		const tilt = tiltFrom(turned(level, { x: 0, y: 0, z: 1 }, 0.2), level);
		expect(tilt.y).toBeCloseTo(-0.2);
		expect(tilt.x).toBeCloseTo(0);
	});

	it("propped in bed, dropping the right edge steers right", () => {
		const level = POSES["propped in bed"];
		// Gravity swings from the bottom edge towards the right edge
		const tilt = tiltFrom(turned(level, { x: 0, y: 0, z: 1 }, 0.2), level);
		expect(tilt.x).toBeCloseTo(0.2 * Math.sin(75 * DEG), 2);
		expect(Math.abs(tilt.y)).toBeLessThan(0.01);
	});

	it("doesn't care how long the vectors are", () => {
		const level = POSES["at a desk"];
		const g = turned(level, { x: 1, y: 0, z: 0 }, 0.3);
		const scaled = tiltFrom({ x: g.x * 9.8, y: g.y * 9.8, z: g.z * 9.8 }, { x: 0, y: -2, z: -2 });
		const unit = tiltFrom(g, unitGravity({ x: 0, y: -1, z: -1 }));
		expect(scaled.x).toBeCloseTo(unit.x);
		expect(scaled.y).toBeCloseTo(unit.y);
	});
});

describe("gravityAt", () => {
	it("undoes tiltFrom, in any pose", () => {
		for (const [pose, level] of Object.entries(POSES)) {
			for (const tilt of [
				{ x: 0.3, y: 0 },
				{ x: 0, y: -0.5 },
				{ x: -0.4, y: 0.25 },
			]) {
				const back = tiltFrom(gravityAt(tilt, level), level);
				expect(back.x, pose).toBeCloseTo(tilt.x);
				expect(back.y, pose).toBeCloseTo(tilt.y);
			}
		}
	});

	it("no tilt is the level pose, at unit length", () => {
		expect(gravityAt({ x: 0, y: 0 }, { x: 0, y: 0, z: -3 })).toEqual({ x: 0, y: 0, z: -1 });
	});
});

describe("levelTilt", () => {
	it("lying screen down turns over to the screen-down pose straight away", () => {
		expect(levelTilt(FLAT_DOWN, FLAT_UP, FLAT_DOWN, false).facingDown).toBe(true);
		expect(levelTilt(FLAT_UP, FLAT_UP, FLAT_DOWN, true).facingDown).toBe(false);
	});

	it("held near upright, the pose in use doesn't flip back and forth", () => {
		// Upright, leaning 10 degrees either way
		for (const lean of [-10 * DEG, 10 * DEG]) {
			const g = heldUp(90 * DEG + lean, 0);
			expect(levelTilt(g, FLAT_UP, FLAT_DOWN, false).facingDown).toBe(false);
			expect(levelTilt(g, FLAT_UP, FLAT_DOWN, true).facingDown).toBe(true);
		}
	});

	it("a pose set on your side holds while you play, whichever way the screen leans", () => {
		const onSide = POSES["on your side, screen a little down"];
		for (const lean of [-30 * DEG, 30 * DEG]) {
			const g = turned(onSide, { x: 0, y: 1, z: 0 }, lean);
			const tilt = levelTilt(g, onSide, FLAT_DOWN, false);
			expect(tilt.facingDown).toBe(false);
			// Not quite all of the turn: the pose's y axis leans a little out of level
			expect(Math.abs(tilt.x)).toBeGreaterThan(29 * DEG);
		}
	});

	it("measures from the pose in use", () => {
		const up = POSES["at a desk"];
		const down = POSES["overhead, tipped"];
		expect(levelTilt(up, up, down, false).x).toBeCloseTo(0);
		const overhead = levelTilt(down, up, down, false);
		expect(overhead.facingDown).toBe(true);
		expect(overhead.x).toBeCloseTo(0);
		expect(overhead.y).toBeCloseTo(0);
	});
});
