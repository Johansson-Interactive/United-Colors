import {
	angleBetween,
	attitudeAt,
	FLAT,
	FLAT_ATTITUDES,
	gravityOf,
	type LevelPoses,
	levelWholeTilt,
	tiltFrom,
	turnBetween,
	unitGravity,
	wholeTilt,
	zeroSwivel,
} from "../../domain/levelPose";
import type { Attitude, Gravity } from "../../domain/types";

const DEG = Math.PI / 180;

/** Gravity with the phone's top edge tipped `pitch` towards you and its right edge `roll` down, from flat */
function heldUp(pitch: number, roll: number): Gravity {
	return gravityOf(attitudeAt({ x: roll, y: pitch }, FLAT_ATTITUDES.up));
}

/** Level poses players hold: at a desk, propped in bed, upright, on their side, overhead */
const POSES: Record<string, Gravity> = {
	flat: FLAT.up,
	"at a desk": heldUp(40 * DEG, 0),
	"propped in bed": heldUp(75 * DEG, 0),
	upright: { x: 0, y: -1, z: 0 },
	"on your side": heldUp(0, 88 * DEG),
	"on your side, exactly": { x: 1, y: 0, z: 0 },
	"on your side, screen a little down": unitGravity({ x: 1, y: 0.1, z: 0.05 }),
	overhead: FLAT.down,
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

/** The phone's own `axis` (unit), as it points in the room while held in `a` */
function axisOf(a: Attitude, axis: "x" | "y" | "z"): Gravity {
	if (axis === "x") return { x: a.xx, y: a.xy, z: a.xz };
	if (axis === "y") return { x: a.yx, y: a.yy, z: a.yz };
	return { x: a.zx, y: a.zy, z: a.zz };
}

/** The phone held in `a`, then turned by `angle` about `axis` of the room (right hand) */
function turnedInRoom(a: Attitude, axis: Gravity, angle: number): Attitude {
	const x = turned(axisOf(a, "x"), axis, angle);
	const y = turned(axisOf(a, "y"), axis, angle);
	const z = turned(axisOf(a, "z"), axis, angle);
	return { xx: x.x, xy: x.y, xz: x.z, yx: y.x, yy: y.y, yz: y.z, zx: z.x, zy: z.y, zz: z.z };
}

/** The phone held in `a`, turned about its own `axis` as it points in the room */
function turnedAbout(a: Attitude, axis: "x" | "y" | "z", angle: number): Attitude {
	return turnedInRoom(a, axisOf(a, axis), angle);
}

/** The phone held in `a`, the player turned about the vertical by `angle`, anticlockwise from above */
function swivelled(a: Attitude, angle: number): Attitude {
	return turnedInRoom(a, { x: 0, y: 0, z: 1 }, angle);
}

/**
 * Level poses players hold, as attitudes. Flat, the top edge points along the room's y axis,
 * away from the player, and the right edge along its x axis.
 */
const HELD: Record<string, Attitude> = {
	flat: FLAT_ATTITUDES.up,
	"reclined 45°": attitudeAt({ x: 0, y: 45 * DEG }, FLAT_ATTITUDES.up),
	upright: attitudeAt({ x: 0, y: 90 * DEG }, FLAT_ATTITUDES.up),
	"on your side": attitudeAt({ x: 90 * DEG, y: 0 }, FLAT_ATTITUDES.up),
	"screen down": FLAT_ATTITUDES.down,
	"screen down, tipped": attitudeAt({ x: 0.3, y: -0.4 }, FLAT_ATTITUDES.down),
	"reclined, facing elsewhere": swivelled(attitudeAt({ x: 0, y: 45 * DEG }, FLAT_ATTITUDES.up), 2),
};

function expectGravity(actual: Gravity, expected: Gravity, label?: string): void {
	expect(actual.x, label).toBeCloseTo(expected.x);
	expect(actual.y, label).toBeCloseTo(expected.y);
	expect(actual.z, label).toBeCloseTo(expected.z);
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
		const right = tiltFrom({ x: Math.sin(0.4), y: 0, z: -Math.cos(0.4) }, FLAT.up);
		expect(right.x).toBeCloseTo(0.4);
		expect(right.y).toBeCloseTo(0);
		// Top edge raised by 0.7 rad: gravity leans to -y
		const top = tiltFrom({ x: 0, y: -Math.sin(0.7), z: -Math.cos(0.7) }, FLAT.up);
		expect(top.x).toBeCloseTo(0);
		expect(top.y).toBeCloseTo(0.7);
	});

	it("screen down, both axes are mirrored from screen up", () => {
		// Right edge lowered by 0.3 rad, as the player sees the screen
		expect(tiltFrom({ x: Math.sin(0.3), y: 0, z: Math.cos(0.3) }, FLAT.down).x).toBeCloseTo(-0.3);
		// Top edge lowered by 0.3 rad
		expect(tiltFrom({ x: 0, y: Math.sin(0.3), z: Math.cos(0.3) }, FLAT.down).y).toBeCloseTo(0.3);
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

describe("wholeTilt", () => {
	const ROOM_X = { x: 1, y: 0, z: 0 };
	const ROOM_Y = { x: 0, y: 1, z: 0 };

	it("the level pose itself reads as no tilt, in any pose", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			const tilt = wholeTilt(held, held);
			expect(tilt.x, pose).toBeCloseTo(0);
			expect(tilt.y, pose).toBeCloseTo(0);
		}
	});

	it("flat, reads the angles from flat as tiltFrom does", () => {
		// Right edge lowered by 0.4 rad: the same gravity as tiltFrom's case
		const right = turnedInRoom(FLAT_ATTITUDES.up, ROOM_Y, 0.4);
		expectGravity(gravityOf(right), { x: Math.sin(0.4), y: 0, z: -Math.cos(0.4) });
		expect(wholeTilt(right, FLAT_ATTITUDES.up).x).toBeCloseTo(0.4);
		expect(wholeTilt(right, FLAT_ATTITUDES.up).y).toBeCloseTo(0);
		// Top edge raised by 0.7 rad
		const top = turnedInRoom(FLAT_ATTITUDES.up, ROOM_X, 0.7);
		expectGravity(gravityOf(top), { x: 0, y: -Math.sin(0.7), z: -Math.cos(0.7) });
		expect(wholeTilt(top, FLAT_ATTITUDES.up).x).toBeCloseTo(0);
		expect(wholeTilt(top, FLAT_ATTITUDES.up).y).toBeCloseTo(0.7);
	});

	it("screen down, both axes read as tiltFrom reads them", () => {
		// Right edge lowered by 0.3 rad, as the player sees the screen: towards the eyes below
		const right = turnedInRoom(FLAT_ATTITUDES.down, ROOM_Y, 0.3);
		expectGravity(gravityOf(right), { x: Math.sin(0.3), y: 0, z: Math.cos(0.3) });
		expect(wholeTilt(right, FLAT_ATTITUDES.down).x).toBeCloseTo(-0.3);
		expect(wholeTilt(right, FLAT_ATTITUDES.down).y).toBeCloseTo(0);
		// Top edge lowered by 0.3 rad: towards the eyes below
		const top = turnedInRoom(FLAT_ATTITUDES.down, ROOM_X, 0.3);
		expectGravity(gravityOf(top), { x: 0, y: Math.sin(0.3), z: Math.cos(0.3) });
		expect(wholeTilt(top, FLAT_ATTITUDES.down).x).toBeCloseTo(0);
		expect(wholeTilt(top, FLAT_ATTITUDES.down).y).toBeCloseTo(0.3);
	});

	it("upright, swivelling the right edge away from the eyes steers right", () => {
		const upright = HELD.upright;
		// Anticlockwise from above: the right edge swings away from the player
		const turnedAway = swivelled(upright, 0.2);
		expectGravity(gravityOf(turnedAway), gravityOf(upright));
		expect(wholeTilt(turnedAway, upright).x).toBeCloseTo(0.2);
		expect(wholeTilt(turnedAway, upright).y).toBeCloseTo(0);
	});

	it("on your side, swivelling the top edge away from the eyes reads as tipping it away", () => {
		const onSide = HELD["on your side"];
		// Anticlockwise from above: the top edge swings away from the screen's face
		const turnedAway = swivelled(onSide, 0.2);
		expectGravity(gravityOf(turnedAway), gravityOf(onSide));
		expect(wholeTilt(turnedAway, onSide).x).toBeCloseTo(0);
		expect(wholeTilt(turnedAway, onSide).y).toBeCloseTo(-0.2);
	});

	it("a roll about the long axis reads in full, in every pose", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			const tilt = wholeTilt(turnedAbout(held, "y", 0.3), held);
			expect(tilt.x, pose).toBeCloseTo(0.3);
			expect(tilt.y, pose).toBeCloseTo(0);
		}
	});

	it("a tip about the short axis reads in full, in every pose", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			const tilt = wholeTilt(turnedAbout(held, "x", -0.3), held);
			expect(tilt.x, pose).toBeCloseTo(0);
			expect(tilt.y, pose).toBeCloseTo(-0.3);
		}
	});

	it("turning the screen like a steering wheel reads as nothing, in every pose", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			const tilt = wholeTilt(turnedAbout(held, "z", 0.4), held);
			expect(tilt.x, pose).toBeCloseTo(0);
			expect(tilt.y, pose).toBeCloseTo(0);
		}
	});

	it("a turn too small to have an axis reads as its size", () => {
		const nudged = turnedAbout(HELD.upright, "y", 1e-12);
		const tilt = wholeTilt(nudged, HELD.upright);
		expect(tilt.x).toBeCloseTo(1e-12, 20);
		expect(tilt.y).toBeCloseTo(0, 20);
	});

	it("tipping through upright while swivelled reads smoothly across the vertical", () => {
		const upright = HELD.upright;
		let last = wholeTilt(
			swivelled(attitudeAt({ x: 0, y: 89 * DEG }, FLAT_ATTITUDES.up), 0.1),
			upright,
		);
		for (let pitch = 89.1; pitch <= 91; pitch += 0.1) {
			const held = swivelled(attitudeAt({ x: 0, y: pitch * DEG }, FLAT_ATTITUDES.up), 0.1);
			const tilt = wholeTilt(held, upright);
			expect(tilt.x).toBeCloseTo(0.1, 2);
			expect(Math.abs(tilt.x - last.x)).toBeLessThan(0.001);
			expect(tilt.y - last.y).toBeCloseTo(0.1 * DEG, 4);
			last = tilt;
		}
	});
});

describe("zeroSwivel", () => {
	const HEADINGS = [0, 1, 3, -2];

	it("the poses read the saved gravities, whatever way the phone is held", () => {
		const saved: LevelPoses[] = [
			FLAT,
			{ up: POSES.upright, down: POSES["overhead, tipped"] },
			{ up: POSES["on your side, exactly"], down: { x: -1, y: 0, z: 0 } },
			{ up: POSES["propped in bed"], down: FLAT.up },
		];
		for (const poses of saved) {
			for (const [pose, held] of Object.entries(HELD)) {
				const zeroed = zeroSwivel(poses, held);
				expectGravity(gravityOf(zeroed.up), unitGravity(poses.up), pose);
				expectGravity(gravityOf(zeroed.down), unitGravity(poses.down), pose);
			}
		}
	});

	it("held at the level pose, the phone reads no tilt, whichever way the player faces", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			const g = gravityOf(held);
			const side = g.z > 0 ? "down" : "up";
			const saved = { ...FLAT, [side]: g };
			for (const heading of HEADINGS) {
				const facing = swivelled(held, heading);
				const tilt = wholeTilt(facing, zeroSwivel(saved, facing)[side]);
				expect(tilt.x, pose).toBeCloseTo(0);
				expect(tilt.y, pose).toBeCloseTo(0);
			}
		}
	});

	it("away from the level pose, the tilt doesn't depend on which way the player faces", () => {
		const saved = { up: POSES.upright, down: FLAT.down };
		const held = attitudeAt({ x: 0.2, y: -0.1 }, HELD.upright);
		const ahead = wholeTilt(held, zeroSwivel(saved, held).up);
		for (const heading of HEADINGS) {
			const facing = swivelled(held, heading);
			const tilt = wholeTilt(facing, zeroSwivel(saved, facing).up);
			expect(tilt.x).toBeCloseTo(ahead.x);
			expect(tilt.y).toBeCloseTo(ahead.y);
		}
	});

	it("once zeroed, a swivel upright reads as a roll", () => {
		const saved = { up: POSES.upright, down: FLAT.down };
		const facing = swivelled(HELD.upright, 1);
		const zeroed = zeroSwivel(saved, facing);
		const tilt = wholeTilt(swivelled(facing, 0.2), zeroed.up);
		expect(tilt.x).toBeCloseTo(0.2);
		expect(tilt.y).toBeCloseTo(0);
	});

	it("lying back after zeroing, the turned-over pose has the same swivel zero", () => {
		for (const heading of HEADINGS) {
			const sitting = swivelled(FLAT_ATTITUDES.up, heading);
			const zeroed = zeroSwivel(FLAT, sitting);
			// Lying back turns the phone over about its short axis
			const lying = turnedAbout(sitting, "x", Math.PI);
			const tilt = wholeTilt(lying, zeroed.down);
			expect(tilt.x).toBeCloseTo(0);
			expect(tilt.y).toBeCloseTo(0);
			// The right edge lowered, towards the eyes below
			const rolled = wholeTilt(turnedAbout(lying, "y", -0.3), zeroed.down);
			expect(rolled.x).toBeCloseTo(-0.3);
		}
	});

	it("sitting up after zeroing screen down, the screen-up pose has the same swivel zero", () => {
		for (const heading of HEADINGS) {
			const lying = swivelled(FLAT_ATTITUDES.down, heading);
			const zeroed = zeroSwivel(FLAT, lying);
			const sitting = turnedAbout(lying, "x", Math.PI);
			const tilt = wholeTilt(sitting, zeroed.up);
			expect(tilt.x).toBeCloseTo(0);
			expect(tilt.y).toBeCloseTo(0);
		}
	});
});

describe("levelWholeTilt", () => {
	it("lying screen down turns over to the screen-down pose straight away", () => {
		expect(levelWholeTilt(FLAT_ATTITUDES.down, FLAT_ATTITUDES, "up").side).toBe("down");
		expect(levelWholeTilt(FLAT_ATTITUDES.up, FLAT_ATTITUDES, "down").side).toBe("up");
	});

	it("held near upright, the pose in use doesn't flip back and forth", () => {
		for (const lean of [-10 * DEG, 10 * DEG]) {
			const held = attitudeAt({ x: 0, y: 90 * DEG + lean }, FLAT_ATTITUDES.up);
			expect(levelWholeTilt(held, FLAT_ATTITUDES, "up").side).toBe("up");
			expect(levelWholeTilt(held, FLAT_ATTITUDES, "down").side).toBe("down");
		}
	});

	it("a swivel never changes the pose in use", () => {
		const held = attitudeAt({ x: 0, y: 100 * DEG }, FLAT_ATTITUDES.up);
		for (const heading of [0.5, 1.5, 3]) {
			expect(levelWholeTilt(swivelled(held, heading), FLAT_ATTITUDES, "up").side).toBe("up");
		}
	});

	it("measures the whole turn from the pose in use", () => {
		const poses = zeroSwivel({ up: POSES.upright, down: FLAT.down }, HELD.upright);
		const up = levelWholeTilt(swivelled(HELD.upright, 0.2), poses, "up");
		expect(up.side).toBe("up");
		expect(up.x).toBeCloseTo(0.2);
		const overhead = levelWholeTilt(turnedAbout(FLAT_ATTITUDES.down, "y", 0.3), poses, "up");
		expect(overhead.side).toBe("down");
		expect(overhead.x).toBeCloseTo(0.3);
		expect(overhead.y).toBeCloseTo(0);
	});
});

describe("turnBetween", () => {
	it("upright, a swivel turns the phone though gravity doesn't move", () => {
		const turnedAway = swivelled(HELD.upright, 2 * DEG);
		expect(angleBetween(gravityOf(turnedAway), gravityOf(HELD.upright))).toBeCloseTo(0);
		expect(turnBetween(turnedAway, HELD.upright)).toBeCloseTo(2 * DEG);
	});

	it("reads the whole turn about any axis, in every pose, either way round", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			for (const axis of ["x", "y", "z"] as const) {
				const moved = turnedAbout(held, axis, 0.3 * DEG);
				expect(turnBetween(moved, held), pose).toBeCloseTo(0.3 * DEG, 9);
				expect(turnBetween(held, moved), pose).toBeCloseTo(0.3 * DEG, 9);
			}
			expect(turnBetween(held, held), pose).toBeCloseTo(0, 9);
		}
	});
});

describe("attitudeAt", () => {
	it("undoes wholeTilt, in every pose", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			for (const tilt of [
				{ x: 0.3, y: 0 },
				{ x: 0, y: -0.5 },
				{ x: -0.4, y: 0.25 },
			]) {
				const back = wholeTilt(attitudeAt(tilt, held), held);
				expect(back.x, pose).toBeCloseTo(tilt.x);
				expect(back.y, pose).toBeCloseTo(tilt.y);
			}
		}
	});

	it("from flat, tips the phone so its gravity reads the same tilt", () => {
		for (const tilt of [
			{ x: 0.4, y: 0 },
			{ x: 0, y: 0.7 },
			{ x: -0.3, y: 0.5 },
		]) {
			const read = tiltFrom(gravityOf(attitudeAt(tilt, FLAT_ATTITUDES.up)), FLAT.up);
			expect(read.x).toBeCloseTo(tilt.x);
			expect(read.y).toBeCloseTo(tilt.y);
		}
	});

	it("the flat level poses read flat gravity", () => {
		expectGravity(gravityOf(FLAT_ATTITUDES.up), FLAT.up);
		expectGravity(gravityOf(FLAT_ATTITUDES.down), FLAT.down);
	});
});
