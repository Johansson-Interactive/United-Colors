import {
	angleBetween,
	FLAT,
	gravityAt,
	gravityTilt,
	levelPosesOf,
	levelTilt,
	poseSide,
	turnedToward,
	unitGravity,
} from "../../domain/levelPose";
import type { Gravity, PoseSide } from "../../domain/types";

const DEG = Math.PI / 180;

/** `g` turned by `angle` about `axis`, in the phone's axes (right hand) */
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

const AXES = {
	x: { x: 1, y: 0, z: 0 },
	y: { x: 0, y: 1, z: 0 },
	z: { x: 0, y: 0, z: 1 },
};

/**
 * The gravity the phone reads at `g`, then turned `angle` about its own `axis` (right hand):
 * gravity turns the other way in the phone's axes
 */
function turnedAbout(g: Gravity, axis: "x" | "y" | "z", angle: number): Gravity {
	return turned(g, AXES[axis], -angle);
}

/** A level pose players hold, as the gravity it reads and the side it is on */
interface Held {
	gravity: Gravity;
	side: PoseSide;
}

/** Reclined `degrees` from flat on `side`, top edge raised: past 90 it leans beyond upright */
const reclined = (degrees: number, side: PoseSide = "up"): Held => ({
	gravity: gravityAt({ x: 0, y: degrees * DEG }, FLAT[side]),
	side,
});

/** Level poses players hold. Flat on a table, gravity points out of the back of the screen. */
const HELD: Record<string, Held> = {
	flat: { gravity: FLAT.up, side: "up" },
	"reclined 45°": reclined(45),
	upright: reclined(90),
	"on your side": { gravity: gravityAt({ x: 90 * DEG, y: 0 }, FLAT.up), side: "up" },
	"screen down": { gravity: FLAT.down, side: "down" },
	"screen down, tipped": { gravity: gravityAt({ x: 0.3, y: -0.4 }, FLAT.down), side: "down" },
	"screen down, raised 70°": reclined(70, "down"),
};

/** Tilt of the phone reading `gravity`, from the level pose `held` */
const tiltOf = (gravity: Gravity, held: Held) => gravityTilt(gravity, held.gravity, held.side);

function expectGravity(actual: Gravity, expected: Gravity, label?: string): void {
	expect(actual.x, label).toBeCloseTo(expected.x);
	expect(actual.y, label).toBeCloseTo(expected.y);
	expect(actual.z, label).toBeCloseTo(expected.z);
}

describe("gravityTilt", () => {
	it("the level pose itself reads as no tilt, in any pose", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			const tilt = tiltOf(held.gravity, held);
			expect(tilt.x, pose).toBeCloseTo(0);
			expect(tilt.y, pose).toBeCloseTo(0);
		}
	});

	it("flat, reads the angles from flat as gravity does", () => {
		// Right edge lowered by 0.4 rad: gravity leans to +x
		const right = turnedAbout(FLAT.up, "y", 0.4);
		expectGravity(right, { x: Math.sin(0.4), y: 0, z: -Math.cos(0.4) });
		expect(gravityTilt(right, FLAT.up, "up").x).toBeCloseTo(0.4);
		expect(gravityTilt(right, FLAT.up, "up").y).toBeCloseTo(0);
		// Top edge raised by 0.7 rad
		const top = turnedAbout(FLAT.up, "x", 0.7);
		expectGravity(top, { x: 0, y: -Math.sin(0.7), z: -Math.cos(0.7) });
		expect(gravityTilt(top, FLAT.up, "up").x).toBeCloseTo(0);
		expect(gravityTilt(top, FLAT.up, "up").y).toBeCloseTo(0.7);
	});

	it("screen down, both axes are mirrored from screen up, as the hand sees them", () => {
		// Right edge lowered by 0.3 rad, as the player sees the screen: towards the eyes below
		const right = turnedAbout(FLAT.down, "y", -0.3);
		expectGravity(right, { x: Math.sin(0.3), y: 0, z: Math.cos(0.3) });
		expect(gravityTilt(right, FLAT.down, "down").x).toBeCloseTo(-0.3);
		expect(gravityTilt(right, FLAT.down, "down").y).toBeCloseTo(0);
		// Top edge lowered by 0.3 rad: towards the eyes below
		const top = turnedAbout(FLAT.down, "x", 0.3);
		expectGravity(top, { x: 0, y: Math.sin(0.3), z: Math.cos(0.3) });
		expect(gravityTilt(top, FLAT.down, "down").x).toBeCloseTo(0);
		expect(gravityTilt(top, FLAT.down, "down").y).toBeCloseTo(0.3);
	});

	it("a roll about the long axis reads in full in poses reclined up to 60 degrees, screen up or down", () => {
		const poses = {
			flat: HELD.flat,
			"reclined 30°": reclined(30),
			"reclined 45°": HELD["reclined 45°"],
			"reclined 60°": reclined(60),
			"screen down": HELD["screen down"],
			"screen down, tipped": HELD["screen down, tipped"],
			"screen down, raised 60°": reclined(60, "down"),
		};
		for (const [pose, held] of Object.entries(poses)) {
			for (const roll of [0.3, -0.2]) {
				const tilt = tiltOf(turnedAbout(held.gravity, "y", roll), held);
				expect(tilt.x, pose).toBeCloseTo(roll, 2);
				// Gravity follows a cone, not a great circle, as a reclined phone rolls: a little
				// of a big roll reads as a tip
				expect(Math.abs(tilt.y), pose).toBeLessThan(0.05);
			}
		}
	});

	it("a tip about the axis that lies level at the pose reads in full, in every pose", () => {
		const cases: [string, Held, "x" | "y"][] = [
			["flat", HELD.flat, "x"],
			["reclined 45°", HELD["reclined 45°"], "x"],
			["upright", HELD.upright, "x"],
			["on your side", HELD["on your side"], "y"],
			["screen down, raised 70°", HELD["screen down, raised 70°"], "x"],
		];
		for (const [pose, held, axis] of cases) {
			const tilt = tiltOf(turnedAbout(held.gravity, axis, 0.3), held);
			expect(axis === "x" ? tilt.y : tilt.x, pose).toBeCloseTo(0.3);
			expect(axis === "x" ? tilt.x : tilt.y, pose).toBeCloseTo(0);
		}
	});

	it("upright, turning the screen clockwise like a steering wheel steers right, in full", () => {
		const tilt = tiltOf(turnedAbout(HELD.upright.gravity, "z", -0.3), HELD.upright);
		expect(tilt.x).toBeCloseTo(0.3);
		expect(tilt.y).toBeCloseTo(0);
	});

	it("on your side, the steering wheel lowering the bottom edge reads as raising the top", () => {
		const held = HELD["on your side"];
		const tilt = tiltOf(turnedAbout(held.gravity, "z", 0.3), held);
		expect(tilt.x).toBeCloseTo(0);
		expect(tilt.y).toBeCloseTo(0.3);
	});

	it("flat, turning the screen like a steering wheel reads as nothing", () => {
		for (const held of [HELD.flat, HELD["screen down"]]) {
			const tilt = tiltOf(turnedAbout(held.gravity, "z", 0.4), held);
			expect(tilt.x).toBeCloseTo(0);
			expect(tilt.y).toBeCloseTo(0);
		}
	});

	it("from flat to upright, steering right reads right and never jumps, by roll or by wheel, screen up or down", () => {
		for (const side of ["up", "down"] as const) {
			const steer = (degrees: number) => {
				const held = reclined(degrees, side);
				return {
					roll: tiltOf(turnedAbout(held.gravity, "y", 0.05), held).x,
					wheel: tiltOf(turnedAbout(held.gravity, "z", -0.05), held).x,
				};
			};
			let last = steer(1);
			for (let degrees = 1.5; degrees <= 90; degrees += 0.5) {
				const now = steer(degrees);
				const label = `${side} ${degrees}`;
				if (degrees <= 60) expect(now.roll, label).toBeCloseTo(0.05, 3);
				expect(now.roll, label).toBeGreaterThanOrEqual(0);
				expect(now.wheel, label).toBeGreaterThan(0);
				expect(Math.abs(now.roll - last.roll), label).toBeLessThan(0.002);
				expect(Math.abs(now.wheel - last.wheel), label).toBeLessThan(0.002);
				last = now;
			}
			expect(last.wheel, side).toBeCloseTo(0.05, 3);
		}
	});

	it("just past upright, the steering wheel still steers the same way round, screen up or down", () => {
		for (const side of ["up", "down"] as const) {
			for (const degrees of [85, 90, 95]) {
				const held = reclined(degrees, side);
				const tilt = tiltOf(turnedAbout(held.gravity, "z", -0.1), held);
				expect(tilt.x, `${side} ${degrees}`).toBeGreaterThan(0.09);
			}
		}
	});

	it("turned right over from the level pose, a half turn", () => {
		const tilt = gravityTilt(FLAT.down, FLAT.up, "up");
		expect(Math.hypot(tilt.x, tilt.y)).toBeCloseTo(Math.PI);
	});
});

describe("levelTilt", () => {
	it("lying screen down turns over to the screen-down pose straight away", () => {
		expect(levelTilt(FLAT.down, FLAT, "up").side).toBe("down");
		expect(levelTilt(FLAT.up, FLAT, "down").side).toBe("up");
	});

	it("held near upright, the pose in use doesn't flip back and forth", () => {
		for (const lean of [-10, 10]) {
			const held = reclined(90 + lean).gravity;
			expect(levelTilt(held, FLAT, "up").side).toBe("up");
			expect(levelTilt(held, FLAT, "down").side).toBe("down");
		}
	});

	it("measures from the pose in use", () => {
		const poses = { up: HELD.upright.gravity, down: FLAT.down };
		const up = levelTilt(turnedAbout(HELD.upright.gravity, "z", -0.2), poses, "up");
		expect(up.side).toBe("up");
		expect(up.x).toBeCloseTo(0.2);
		const overhead = levelTilt(turnedAbout(FLAT.down, "y", 0.3), poses, "up");
		expect(overhead.side).toBe("down");
		expect(overhead.x).toBeCloseTo(0.3);
		expect(overhead.y).toBeCloseTo(0);
	});

	it("a screen-down pose raised past 60 degrees steers the hand's way round, as one short of it", () => {
		for (const degrees of [59, 61, 70]) {
			const pose = reclined(degrees, "down").gravity;
			const tilt = levelTilt(turnedAbout(pose, "y", 0.1), { up: FLAT.up, down: pose }, "down");
			expect(tilt.side).toBe("down");
			expect(tilt.x, `${degrees}`).toBeGreaterThan(0.05);
		}
	});
});

describe("levelPosesOf", () => {
	it("measures from each saved pose at unit length, and flat where none is set", () => {
		const poses = levelPosesOf({ up: { x: 0, y: -2, z: 0 }, down: null });
		expectGravity(poses.up, { x: 0, y: -1, z: 0 });
		expect(poses.down).toBe(FLAT.down);
	});

	it("keeps a saved pose up to 30 degrees past upright on its side", () => {
		const down = reclined(115, "down").gravity;
		const up = reclined(115).gravity;
		expect(levelPosesOf({ up, down })).toEqual({ up, down });
	});

	it("reads a saved pose that lies on the other side as flat", () => {
		const poses = levelPosesOf({ up: reclined(125).gravity, down: reclined(125, "down").gravity });
		expect(poses).toEqual(FLAT);
	});

	it("a pose set flat while the screen-down pose was in use no longer steers backwards", () => {
		const flat = gravityAt({ x: 0, y: 0.02 }, FLAT.up);
		const poses = levelPosesOf({ up: HELD.upright.gravity, down: flat });
		const tilt = levelTilt(turnedAbout(flat, "y", 0.2), poses, "up");
		expect(tilt.x).toBeGreaterThan(0);
	});
});

describe("poseSide", () => {
	it("a pose belongs on the side its screen faces, whichever pose is in use", () => {
		for (const inUse of ["up", "down"] as const) {
			expect(poseSide(HELD.flat.gravity, inUse)).toBe("up");
			expect(poseSide(HELD["reclined 45°"].gravity, inUse)).toBe("up");
			expect(poseSide(HELD["screen down, tipped"].gravity, inUse)).toBe("down");
			expect(poseSide(HELD["screen down"].gravity, inUse)).toBe("down");
		}
	});

	it("within 30 degrees of upright, a pose belongs on the side in use", () => {
		for (const degrees of [65, 90, 115]) {
			for (const inUse of ["up", "down"] as const) {
				expect(poseSide(reclined(degrees).gravity, inUse), `${degrees}`).toBe(inUse);
			}
		}
	});
});

describe("turnedToward", () => {
	it("takes the given share of the angle, the shortest way, in every pose", () => {
		for (const [pose, held] of Object.entries(HELD)) {
			const to = gravityAt({ x: 0.3, y: -0.2 }, held.gravity);
			const whole = angleBetween(held.gravity, to);
			for (const share of [0, 0.25, 0.5, 1]) {
				const part = turnedToward(held.gravity, to, share);
				expect(angleBetween(held.gravity, part), pose).toBeCloseTo(whole * share, 9);
				expect(angleBetween(part, to), pose).toBeCloseTo(whole * (1 - share), 9);
			}
		}
	});

	it("straight apart, where no turn is shortest, jumps to the target", () => {
		expect(turnedToward(FLAT.up, FLAT.down, 0.5)).toBe(FLAT.down);
	});
});

describe("gravityAt", () => {
	it("undoes gravityTilt from the flat poses", () => {
		for (const side of ["up", "down"] as const) {
			for (const tilt of [
				{ x: 0.3, y: 0 },
				{ x: 0, y: -0.5 },
				{ x: -0.4, y: 0.25 },
			]) {
				const back = gravityTilt(gravityAt(tilt, FLAT[side]), FLAT[side], side);
				expect(back.x, side).toBeCloseTo(tilt.x);
				expect(back.y, side).toBeCloseTo(tilt.y);
			}
		}
	});
});
