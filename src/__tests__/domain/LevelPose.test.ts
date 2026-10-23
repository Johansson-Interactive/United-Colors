import {
	angleBetween,
	attitudeAt,
	FLAT,
	FLAT_ATTITUDES,
	gravityOf,
	gravityTilt,
	levelTilt,
	turnBetween,
	turnedToward,
	unitGravity,
} from "../../domain/levelPose";
import type { Attitude, Gravity } from "../../domain/types";
import { swivelled } from "./attitudes";

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

describe("gravityTilt", () => {
	const ROOM_X = { x: 1, y: 0, z: 0 };
	const ROOM_Y = { x: 0, y: 1, z: 0 };
	const HEADINGS = [0.5, Math.PI / 2, 2, Math.PI - 0.1, -2];

	/** Tilt of the phone held in `a` from the level pose held in `pose` */
	const tiltOf = (a: Attitude, pose: Attitude) => gravityTilt(a, gravityOf(pose));

	/** Reclined `degrees` from flat, screen up, top edge raised */
	const reclined = (degrees: number) => attitudeAt({ x: 0, y: degrees * DEG }, FLAT_ATTITUDES.up);

	it("the level pose itself reads as no tilt, in any pose", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			const tilt = tiltOf(held, held);
			expect(tilt.x, pose).toBeCloseTo(0);
			expect(tilt.y, pose).toBeCloseTo(0);
		}
	});

	it("flat, reads the angles from flat as gravity does", () => {
		// Right edge lowered by 0.4 rad: gravity leans to +x
		const right = turnedInRoom(FLAT_ATTITUDES.up, ROOM_Y, 0.4);
		expectGravity(gravityOf(right), { x: Math.sin(0.4), y: 0, z: -Math.cos(0.4) });
		expect(gravityTilt(right, FLAT.up).x).toBeCloseTo(0.4);
		expect(gravityTilt(right, FLAT.up).y).toBeCloseTo(0);
		// Top edge raised by 0.7 rad
		const top = turnedInRoom(FLAT_ATTITUDES.up, ROOM_X, 0.7);
		expectGravity(gravityOf(top), { x: 0, y: -Math.sin(0.7), z: -Math.cos(0.7) });
		expect(gravityTilt(top, FLAT.up).x).toBeCloseTo(0);
		expect(gravityTilt(top, FLAT.up).y).toBeCloseTo(0.7);
	});

	it("screen down, both axes are mirrored from screen up, as the hand sees them", () => {
		// Right edge lowered by 0.3 rad, as the player sees the screen: towards the eyes below
		const right = turnedInRoom(FLAT_ATTITUDES.down, ROOM_Y, 0.3);
		expectGravity(gravityOf(right), { x: Math.sin(0.3), y: 0, z: Math.cos(0.3) });
		expect(gravityTilt(right, FLAT.down).x).toBeCloseTo(-0.3);
		expect(gravityTilt(right, FLAT.down).y).toBeCloseTo(0);
		// Top edge lowered by 0.3 rad: towards the eyes below
		const top = turnedInRoom(FLAT_ATTITUDES.down, ROOM_X, 0.3);
		expectGravity(gravityOf(top), { x: 0, y: Math.sin(0.3), z: Math.cos(0.3) });
		expect(gravityTilt(top, FLAT.down).x).toBeCloseTo(0);
		expect(gravityTilt(top, FLAT.down).y).toBeCloseTo(0.3);
	});

	it("turning on the spot never moves the tilt, in any pose, leaning or not", () => {
		const leans = [
			{ x: 0, y: 0 },
			{ x: 0.3, y: 0 },
			{ x: 0, y: -0.25 },
			{ x: -0.2, y: 0.15 },
		];
		for (const [pose, held] of Object.entries(HELD)) {
			for (const lean of leans) {
				const leaning = attitudeAt(lean, held);
				const ahead = tiltOf(leaning, held);
				for (const heading of HEADINGS) {
					const tilt = tiltOf(swivelled(leaning, heading), held);
					expect(tilt.x, `${pose} ${heading}`).toBeCloseTo(ahead.x);
					expect(tilt.y, `${pose} ${heading}`).toBeCloseTo(ahead.y);
				}
			}
		}
	});

	it("a roll about the long axis reads in full in poses reclined up to 60 degrees, screen up or down", () => {
		const poses = {
			flat: HELD.flat,
			"reclined 30°": reclined(30),
			"reclined 45°": HELD["reclined 45°"],
			"reclined 60°": reclined(60),
			"screen down": HELD["screen down"],
			"screen down, tipped": HELD["screen down, tipped"],
			"reclined, facing elsewhere": HELD["reclined, facing elsewhere"],
		};
		for (const [pose, held] of Object.entries(poses)) {
			for (const roll of [0.3, -0.2]) {
				const tilt = tiltOf(turnedAbout(held, "y", roll), held);
				expect(tilt.x, pose).toBeCloseTo(roll, 2);
				// Gravity follows a cone, not a great circle, as a reclined phone rolls: a little
				// of a big roll reads as a tip
				expect(Math.abs(tilt.y), pose).toBeLessThan(0.05);
			}
		}
	});

	it("a tip about the axis that lies level at the pose reads in full, in every pose", () => {
		const cases: [string, Attitude, "x" | "y"][] = [
			["flat", HELD.flat, "x"],
			["reclined 45°", HELD["reclined 45°"], "x"],
			["upright", HELD.upright, "x"],
			["on your side", HELD["on your side"], "y"],
		];
		for (const [pose, held, axis] of cases) {
			const tilt = tiltOf(turnedAbout(held, axis, 0.3), held);
			expect(axis === "x" ? tilt.y : tilt.x, pose).toBeCloseTo(0.3);
			expect(axis === "x" ? tilt.x : tilt.y, pose).toBeCloseTo(0);
		}
	});

	it("upright, turning the screen clockwise like a steering wheel steers right, in full", () => {
		const tilt = tiltOf(turnedAbout(HELD.upright, "z", -0.3), HELD.upright);
		expect(tilt.x).toBeCloseTo(0.3);
		expect(tilt.y).toBeCloseTo(0);
	});

	it("on your side, the steering wheel lowering the bottom edge reads as raising the top", () => {
		const tilt = tiltOf(turnedAbout(HELD["on your side"], "z", 0.3), HELD["on your side"]);
		expect(tilt.x).toBeCloseTo(0);
		expect(tilt.y).toBeCloseTo(0.3);
	});

	it("flat, turning the screen like a steering wheel reads as nothing", () => {
		for (const held of [HELD.flat, HELD["screen down"]]) {
			const tilt = tiltOf(turnedAbout(held, "z", 0.4), held);
			expect(tilt.x).toBeCloseTo(0);
			expect(tilt.y).toBeCloseTo(0);
		}
	});

	it("from flat to upright, steering right reads right and never jumps, by roll or by wheel", () => {
		const steer = (degrees: number) => {
			const held = reclined(degrees);
			return {
				roll: tiltOf(turnedAbout(held, "y", 0.05), held).x,
				wheel: tiltOf(turnedAbout(held, "z", -0.05), held).x,
			};
		};
		let last = steer(1);
		for (let degrees = 1.5; degrees <= 90; degrees += 0.5) {
			const now = steer(degrees);
			if (degrees <= 60) expect(now.roll, `${degrees}`).toBeCloseTo(0.05, 3);
			expect(now.roll, `${degrees}`).toBeGreaterThanOrEqual(0);
			expect(now.wheel, `${degrees}`).toBeGreaterThan(0);
			expect(Math.abs(now.roll - last.roll), `${degrees}`).toBeLessThan(0.002);
			expect(Math.abs(now.wheel - last.wheel), `${degrees}`).toBeLessThan(0.002);
			last = now;
		}
		expect(last.wheel).toBeCloseTo(0.05, 3);
	});

	it("just past upright, the steering wheel still steers the same way round", () => {
		for (const degrees of [85, 90, 95]) {
			const held = reclined(degrees);
			const tilt = tiltOf(turnedAbout(held, "z", -0.1), held);
			expect(tilt.x, `${degrees}`).toBeGreaterThan(0.09);
		}
	});

	it("reads the tilt from flat whichever way the phone faces, screen up or down", () => {
		const tilt = { x: 0.3, y: -0.2 };
		for (const heading of [0, 1, -2.5, Math.PI]) {
			const up = gravityTilt(swivelled(attitudeAt(tilt, FLAT_ATTITUDES.up), heading), FLAT.up);
			expect(up.x).toBeCloseTo(tilt.x);
			expect(up.y).toBeCloseTo(tilt.y);
			const down = gravityTilt(
				swivelled(attitudeAt(tilt, FLAT_ATTITUDES.down), heading),
				FLAT.down,
			);
			expect(down.x).toBeCloseTo(tilt.x);
			expect(down.y).toBeCloseTo(tilt.y);
		}
	});

	it("turned right over from the level pose, a half turn", () => {
		const tilt = gravityTilt(FLAT_ATTITUDES.down, FLAT.up);
		expect(Math.hypot(tilt.x, tilt.y)).toBeCloseTo(Math.PI);
	});
});

describe("levelTilt", () => {
	it("lying screen down turns over to the screen-down pose straight away", () => {
		expect(levelTilt(FLAT_ATTITUDES.down, FLAT, "up").side).toBe("down");
		expect(levelTilt(FLAT_ATTITUDES.up, FLAT, "down").side).toBe("up");
	});

	it("held near upright, the pose in use doesn't flip back and forth", () => {
		for (const lean of [-10 * DEG, 10 * DEG]) {
			const held = attitudeAt({ x: 0, y: 90 * DEG + lean }, FLAT_ATTITUDES.up);
			expect(levelTilt(held, FLAT, "up").side).toBe("up");
			expect(levelTilt(held, FLAT, "down").side).toBe("down");
		}
	});

	it("a swivel never changes the pose in use", () => {
		const held = attitudeAt({ x: 0, y: 100 * DEG }, FLAT_ATTITUDES.up);
		for (const heading of [0.5, 1.5, 3]) {
			expect(levelTilt(swivelled(held, heading), FLAT, "up").side).toBe("up");
		}
	});

	it("measures from the pose in use", () => {
		const poses = { up: POSES.upright, down: FLAT.down };
		const up = levelTilt(turnedAbout(HELD.upright, "z", -0.2), poses, "up");
		expect(up.side).toBe("up");
		expect(up.x).toBeCloseTo(0.2);
		const overhead = levelTilt(turnedAbout(FLAT_ATTITUDES.down, "y", 0.3), poses, "up");
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

describe("turnedToward", () => {
	it("takes the given share of the whole turn, the shortest way, in every pose", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			const to = swivelled(attitudeAt({ x: 0.3, y: -0.2 }, held), 0.4);
			const whole = turnBetween(held, to);
			for (const share of [0, 0.25, 0.5, 1]) {
				const part = turnedToward(held, to, share);
				expect(turnBetween(held, part), pose).toBeCloseTo(whole * share, 9);
				expect(turnBetween(part, to), pose).toBeCloseTo(whole * (1 - share), 9);
			}
		}
	});

	it("upright, follows a swivel though gravity doesn't move", () => {
		const to = swivelled(HELD.upright, 0.2);
		const half = turnedToward(HELD.upright, to, 0.5);
		expect(turnBetween(half, HELD.upright)).toBeCloseTo(0.1);
		expect(turnBetween(half, to)).toBeCloseTo(0.1);
	});
});

describe("attitudeAt", () => {
	it("undoes gravityTilt from the flat poses", () => {
		for (const side of ["up", "down"] as const) {
			for (const tilt of [
				{ x: 0.3, y: 0 },
				{ x: 0, y: -0.5 },
				{ x: -0.4, y: 0.25 },
			]) {
				const back = gravityTilt(attitudeAt(tilt, FLAT_ATTITUDES[side]), FLAT[side]);
				expect(back.x, side).toBeCloseTo(tilt.x);
				expect(back.y, side).toBeCloseTo(tilt.y);
			}
		}
	});

	it("the flat level poses read flat gravity", () => {
		expectGravity(gravityOf(FLAT_ATTITUDES.up), FLAT.up);
		expectGravity(gravityOf(FLAT_ATTITUDES.down), FLAT.down);
	});
});
