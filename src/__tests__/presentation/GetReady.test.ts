import type { Disc } from "../../application/sceneRecord";
import { PLAYER_NECK, PLAYER_PRESS, pressedRadius } from "../../application/wall";
import { cornerExtent, holdInside } from "../../domain/arena";
import type { Corners } from "../../domain/types";
import {
	EDGE_GROW_MS,
	edgeRadius,
	PAUSE_ALL,
	type Point,
	portalReach,
	RIM,
	restRadius,
} from "../../presentation/effects/portal";
import { BOWL_SIZE } from "../../presentation/theme/theme";
import {
	advanceGetReady,
	CUP_RADIUS,
	closeGetReady,
	type GetReadyFrame,
	type GetReadyFrameState,
	type GetReadyState,
	HOLD_MS,
	INITIAL_GET_READY,
	OPEN_GET_READY,
	PULSE_MS,
	portalRadius,
	type Roll,
	rimOpacity,
	rollAt,
	rollBody,
	rollTarget,
	seated,
	seatPulse,
	stepGetReady,
	stepRoll,
} from "../../presentation/tilt/getReady";

const field = { width: 400, height: 800, cornerExtent: 0 };
/** Where the player dot froze, at its radius */
const seat = { x: 150, y: 300, radius: 20 };
const LEVEL = { x: 0, y: 0 };
const TIPPED = { x: 0.5, y: 0 };
/** The overlay's frame, as the frame steps below play it */
const FRAME_DT = 16;
/** Long enough for the cup to open and the hold to fill, with room to spare */
const PLENTY = EDGE_GROW_MS + HOLD_MS * 2;
/** How far the rolling dot can get from the seat inside the cup */
const TRAVEL = CUP_RADIUS - seat.radius - 6;
/** How near a wall the walls let the seat's centre come, pressed in as deep as the player goes */
const CORE = seat.radius * (1 - PLAYER_PRESS);

function run(
	state: GetReadyState,
	x: number,
	y: number,
	ms: number,
	armed = true,
	dt = 10,
): GetReadyState {
	let s = state;
	for (let t = 0; t < ms; t += dt) s = stepGetReady(s, x, y, dt, armed);
	return s;
}

/** Frames for `ms` at one tilt, as the overlay's frame callback steps them */
function play(
	from: GetReadyFrameState,
	tilt: Point,
	ms: number,
	on: Disc | null = seat,
	held = true,
): { state: GetReadyFrameState; frames: GetReadyFrame[] } {
	let state = from;
	const frames: GetReadyFrame[] = [];
	for (let t = 0; t < ms; t += FRAME_DT) {
		const next = advanceGetReady(state, {
			seat: on,
			held,
			tilt,
			dt: FRAME_DT,
			field,
			sensitivity: 1,
		});
		state = next.state;
		frames.push(next.frame);
	}
	return { state, frames };
}

/** How many frames of a held finger the cup takes to open fully at `seat` */
function framesToOpen(on: Disc = seat): number {
	const { frames } = play(OPEN_GET_READY, TIPPED, EDGE_GROW_MS, on);
	return frames.findIndex((f) => f.opened === 1) + 1;
}
/** Frames held while the cup opens at the test seat, before the hold can count */
const OPEN_FRAMES = framesToOpen();
const OPENING_MS = OPEN_FRAMES * FRAME_DT;

/** Get ready with the cup open and the hold half full */
const halfHeld = () => play(OPEN_GET_READY, LEVEL, OPENING_MS + FRAME_DT + HOLD_MS / 2).state;

describe("get-ready stepper", () => {
	it("armed and level, fires after the hold, and not before", () => {
		const almost = run(INITIAL_GET_READY, 0, 0, HOLD_MS - 10);
		expect(almost.fired).toBe(false);
		expect(run(almost, 0, 0, 10).fired).toBe(true);
	});

	it("counts nothing until armed, however level", () => {
		const unarmed = run(INITIAL_GET_READY, 0, 0, HOLD_MS * 2, false);
		expect(unarmed.progress).toBe(0);
		expect(unarmed.fired).toBe(false);
	});

	it("drifting off level drains the hold faster than it fills", () => {
		const held = run(INITIAL_GET_READY, 0.05, -0.05, HOLD_MS / 2);
		expect(held.progress).toBeCloseTo(0.5, 6);
		const drifted = run(held, 0.2, 0, 200);
		expect(drifted.progress).toBeLessThan(0.5 - 200 / HOLD_MS);
		expect(run(drifted, 0, 0.3, 1000).progress).toBe(0);
	});

	it("disarmed, drains the hold the same way", () => {
		const held = run(INITIAL_GET_READY, 0, 0, HOLD_MS / 2);
		expect(run(held, 0, 0, 200, false).progress).toBeCloseTo(run(held, 0.2, 0, 200).progress, 9);
	});

	it("tilt on either axis alone breaks the hold", () => {
		const held = run(INITIAL_GET_READY, 0, 0, HOLD_MS / 2);
		expect(run(held, 0.12, 0, 100).progress).toBeLessThan(held.progress);
		expect(run(held, 0, -0.12, 100).progress).toBeLessThan(held.progress);
	});

	it("fires once only", () => {
		const fired = run(INITIAL_GET_READY, 0, 0, PLENTY);
		expect(fired.fired).toBe(true);
		expect(stepGetReady(fired, 0, 0, 16, true)).toBe(fired);
		expect(stepGetReady(fired, 0.5, 0.5, 16, false)).toBe(fired);
	});
});

describe("get-ready roll target", () => {
	it("is the seat when level", () => {
		expect(rollTarget(seat, LEVEL, 1, field)).toEqual({ x: seat.x, y: seat.y });
	});

	it("follows the tilt by its gain times the sensitivity", () => {
		expect(rollTarget(seat, { x: 0.2, y: -0.1 }, 1, field)).toEqual({ x: 180, y: 285 });
		expect(rollTarget(seat, { x: 0.2, y: -0.1 }, 1.5, field)).toEqual({ x: 195, y: 277.5 });
	});

	it("is the title bowl's size, so the dot rolls in it as it does there", () => {
		expect(CUP_RADIUS).toBe(BOWL_SIZE / 2);
	});

	it("stays inside the cup, however hard the phone is tilted, keeping the tilt's direction", () => {
		for (const [x, y] of [
			[2, 0],
			[-2, 0.5],
			[0.7, -0.7],
			[0, -3],
		]) {
			const at = rollTarget(seat, { x, y }, 1, field);
			const off = { x: at.x - seat.x, y: at.y - seat.y };
			expect(Math.hypot(off.x, off.y)).toBeCloseTo(TRAVEL, 9);
			expect(Math.atan2(off.y, off.x)).toBeCloseTo(Math.atan2(y, x), 9);
		}
		expect(rollTarget(seat, { x: 1.5, y: 0 }, 2, field).x).toBeCloseTo(seat.x + TRAVEL, 9);
	});

	it("presses into a wall where the cup runs past it, no deeper than the player does, sliding along it", () => {
		const byTheWall = { x: 40, y: 300, radius: 20 };
		const into = rollTarget(byTheWall, { x: -2, y: 0.1 }, 1, field);
		expect(into.x).toBeCloseTo(CORE, 9);
		expect(into.y).toBeGreaterThan(byTheWall.y);
		const byTheFloor = { x: 200, y: 770, radius: 20 };
		const down = rollTarget(byTheFloor, { x: 0.1, y: 2 }, 1, field);
		expect(down.y).toBeCloseTo(field.height - CORE, 9);
		expect(down.x).toBeGreaterThan(byTheFloor.x);
	});

	it("presses into a corner no deeper than into a wall", () => {
		const cornerSeat = { x: 25, y: 780, radius: 20 };
		const at = rollTarget(cornerSeat, { x: -0.5, y: 0.5 }, 1, field);
		expect(at.x).toBeCloseTo(CORE, 9);
		expect(at.y).toBeCloseTo(field.height - CORE, 9);
	});

	it("reaches a seat where the player froze pressed into a wall, so the dot can be rolled home", () => {
		// Frozen pressed into the left wall, as deep as the player presses
		const pressed = { x: CORE, y: 300, radius: 20 };
		expect(rollTarget(pressed, LEVEL, 1, field)).toEqual({ x: pressed.x, y: pressed.y });
		// Even past that (a seat is always in reach), on a straight wall and in a rounded corner
		const deeper = { x: 10, y: 300, radius: 20 };
		expect(rollTarget(deeper, LEVEL, 1, field)).toEqual({ x: 10, y: 300 });
		const rounded = { ...field, cornerExtent: 60 };
		const inCorner = { x: 15, y: 785, radius: 20 };
		const home = rollTarget(inCorner, LEVEL, 1, rounded);
		expect(home.x).toBeCloseTo(inCorner.x, 9);
		expect(home.y).toBeCloseTo(inCorner.y, 9);
	});

	it.each<Corners>([
		{ radius: 55, curve: "continuous" },
		{ radius: 40, curve: "circular" },
	])("stays clear of a rounded corner ($curve), where the player slides round it", (corners) => {
		const screen = { width: 400, height: 800, corners };
		const rounded = { ...field, cornerExtent: cornerExtent(screen) };
		// Frozen near the corner, so the cup's travel reaches into it
		const dot = { x: 60, y: 740, radius: 21 };
		// Tilted hard towards every part of the screen's edge, corners included
		for (let a = 0; a < 360; a += 5) {
			const rad = (a * Math.PI) / 180;
			const tilt = { x: Math.cos(rad) * 5, y: Math.sin(rad) * 5 };
			const at = rollTarget(dot, tilt, 1, rounded);
			// The game's own bound for a dot this size, pressed in as deep as it goes, leaves it be
			const held = holdInside(screen, at.x, at.y, dot.radius * (1 - PLAYER_PRESS));
			expect(held.x).toBeCloseTo(at.x, 6);
			expect(held.y).toBeCloseTo(at.y, 6);
		}
	});
});

describe("get-ready rolling dot body", () => {
	it("is the dot as it is, with no wall, clear of the walls", () => {
		const free = {
			x: seat.x,
			y: seat.y,
			radius: seat.radius,
			wallX: 0,
			wallY: 0,
			wallC: 0,
			neck: 0,
		};
		expect(rollBody({ x: seat.x, y: seat.y }, seat.radius, field)).toEqual(free);
		// Just touching a wall is no press yet
		expect(rollBody({ x: seat.radius, y: 300 }, seat.radius, field).neck).toBe(0);
	});

	it("presses into a wall as the player does in play: cut off at it, wetting it, keeping its area", () => {
		const press = 4;
		const body = rollBody({ x: seat.radius - press, y: 300 }, seat.radius, field);
		expect(body).toEqual({
			x: seat.radius - press,
			y: 300,
			radius: pressedRadius(seat.radius, press),
			// The left wall: inward normal along +x, at x = 0
			wallX: 1,
			wallY: -0,
			wallC: 0,
			neck: (PLAYER_NECK * press) / PLAYER_PRESS,
		});
		expect(body.radius).toBeGreaterThan(seat.radius);
		// Into the floor, the floor's wall
		const floor = rollBody({ x: 200, y: field.height - seat.radius + press }, seat.radius, field);
		expect(floor.wallY).toBe(-1);
		expect(floor.wallX * 200 + floor.wallY * field.height - floor.wallC).toBeCloseTo(0, 9);
	});

	it("presses no deeper than the player, backing out when the roll overshoots", () => {
		const deepest = rollBody({ x: CORE, y: 300 }, seat.radius, field);
		const past = rollBody({ x: CORE - 5, y: 300 }, seat.radius, field);
		expect(past).toEqual(deepest);
		expect(deepest.neck).toBeCloseTo(seat.radius * PLAYER_NECK, 9);
	});

	it("presses into a rounded corner along its curve", () => {
		const rounded = { ...field, cornerExtent: 60 };
		// Pressed 3 px past the corner's quarter circle, diagonally into the bottom-left corner
		const out = 60 - seat.radius + 3;
		const at = { x: 60 - out / Math.SQRT2, y: 740 + out / Math.SQRT2 };
		const body = rollBody(at, seat.radius, rounded);
		expect(body.wallX).toBeCloseTo(Math.SQRT1_2, 9);
		expect(body.wallY).toBeCloseTo(-Math.SQRT1_2, 9);
		expect(body.radius).toBeCloseTo(pressedRadius(seat.radius, 3), 9);
		// The wall's line passes through the curve under the dot
		const foot = { x: 60 - 60 / Math.SQRT2, y: 740 + 60 / Math.SQRT2 };
		expect(body.wallX * foot.x + body.wallY * foot.y - body.wallC).toBeCloseTo(0, 9);
	});

	it("is drawn with the frame, pressed when the seat is pressed into a wall", () => {
		const pressed = { x: CORE, y: 300, radius: 20 };
		const { frames } = play(OPEN_GET_READY, LEVEL, FRAME_DT, pressed);
		expect(frames[0].body.neck).toBeGreaterThan(0);
		const { frames: free } = play(OPEN_GET_READY, LEVEL, FRAME_DT);
		expect(free[0].body.neck).toBe(0);
	});
});

describe("get-ready roll", () => {
	const target = { x: seat.x + 60, y: seat.y - 30 };

	function roll(from: Roll, to: Point, ms: number, dt = 16): Roll {
		let r = from;
		for (let t = 0; t < ms; t += dt) r = stepRoll(r, to, dt);
		return r;
	}

	it("opens at rest on the seat, and stays there while the target is the seat", () => {
		const rest = rollAt(seat);
		expect(rest).toEqual({ x: 150, y: 300, vx: 0, vy: 0 });
		expect(roll(rest, seat, 1000)).toEqual(rest);
	});

	it("rolls to where the tilt pushes it and comes to rest there within a second", () => {
		const there = roll(rollAt(seat), target, 1000);
		expect(there.x).toBeCloseTo(target.x, 0);
		expect(there.y).toBeCloseTo(target.y, 0);
		expect(Math.hypot(there.vx, there.vy)).toBeLessThan(1);
	});

	it("arrives with some weight: it overshoots a little before settling", () => {
		let r = rollAt(seat);
		let farthest = 0;
		for (let t = 0; t < 1000; t += 16) {
			r = stepRoll(r, target, 16);
			farthest = Math.max(farthest, r.x);
		}
		expect(farthest).toBeGreaterThan(target.x + 2);
		expect(farthest).toBeLessThan(target.x + 20);
	});

	it("rolls back home and settles when the tilt eases", () => {
		const away = roll(rollAt(seat), target, 1000);
		const home = roll(away, seat, 1000);
		expect(home.x).toBeCloseTo(seat.x, 0);
		expect(home.y).toBeCloseTo(seat.y, 0);
	});

	it("takes a hitched frame as a short one, so it never flies past its travel", () => {
		const hitch = stepRoll(rollAt(seat), target, 500);
		expect(hitch.x).toBeGreaterThan(seat.x);
		expect(hitch.x).toBeLessThan(target.x);
		expect(stepRoll(rollAt(seat), target, 40)).toEqual(hitch);
	});
});

describe("get-ready seat", () => {
	it("counts the dot as seated on the seat, and less so as it rolls off", () => {
		expect(seated(seat, seat)).toBe(1);
		const near = seated({ x: seat.x + 15, y: seat.y }, seat);
		expect(near).toBeGreaterThan(0);
		expect(near).toBeLessThan(1);
		expect(seated({ x: seat.x, y: seat.y + 60 }, seat)).toBe(0);
	});

	it("pulses on the point dot's rhythm, from rest to full and back", () => {
		expect(PULSE_MS).toBe(800);
		expect(seatPulse(0)).toBeCloseTo(0, 9);
		expect(seatPulse(PULSE_MS / 2)).toBeCloseTo(1, 9);
		expect(seatPulse(PULSE_MS)).toBeCloseTo(0, 9);
	});
});

describe("get-ready portal", () => {
	const reach = portalReach(seat, field);

	it("rests at the cup, breathing a little with the pulse", () => {
		expect(portalRadius(0, reach, 0)).toBe(CUP_RADIUS);
		const breathing = portalRadius(0, reach, 1);
		expect(breathing).toBeGreaterThan(CUP_RADIUS);
		expect(breathing).toBeLessThan(CUP_RADIUS * 1.05);
	});

	it("clears the whole field at full progress, whatever the breath", () => {
		expect(portalRadius(1, reach, 0)).toBe(reach);
		expect(portalRadius(1, reach, 1)).toBe(reach);
	});

	it("widens monotonically with the hold", () => {
		let previous = 0;
		for (let p = 0; p <= 1; p += 0.05) {
			const r = portalRadius(p, reach, 0);
			expect(r).toBeGreaterThanOrEqual(previous);
			previous = r;
		}
	});
});

describe("get-ready rim", () => {
	it("beats with the pulse while the dot is away", () => {
		expect(rimOpacity(0, 0, 1)).toBeGreaterThan(rimOpacity(0, 0, 0));
		expect(rimOpacity(0, 0, 0)).toBeGreaterThan(0);
	});

	it("holds steady once the dot is home, whatever the pulse", () => {
		expect(rimOpacity(0, 1, 0)).toBe(rimOpacity(0, 1, 1));
	});

	it("is gone by the time the portal has cleared the field", () => {
		expect(rimOpacity(0.3, 1, 0)).toBe(rimOpacity(0, 1, 0));
		expect(rimOpacity(0.8, 1, 0)).toBeLessThan(rimOpacity(0.6, 1, 0));
		expect(rimOpacity(1, 1, 0)).toBe(0);
		expect(rimOpacity(1, 0, 1)).toBe(0);
	});
});

describe("get-ready cup", () => {
	/** The bloom's growth past its rest at this seat, `ms` into its hold: the cup opens at this pace */
	const bloomGrowth = (ms: number, on: Disc = seat) => {
		const rest = restRadius(on.radius);
		return edgeRadius(ms / EDGE_GROW_MS, rest, portalReach(on, field)) - rest;
	};

	it("grows from nothing at the seat to the cup's size at the bloom's pace while held", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, EDGE_GROW_MS);
		for (const f of frames) {
			expect(f.portal.x).toBe(seat.x);
			expect(f.portal.y).toBe(seat.y);
			expect(f.portal.inside).toBe("play");
		}
		// The first frame is a sliver, as the bloom's first frame is
		expect(frames[0].portal.radius).toBeLessThan(2);
		for (let i = 0; i < OPEN_FRAMES - 1; i++) {
			expect(frames[i].portal.radius).toBeCloseTo(bloomGrowth((i + 1) * FRAME_DT), 9);
		}
		expect(frames[OPEN_FRAMES - 1].portal.radius).toBe(CUP_RADIUS);
		// Mid-field on a phone-sized stage, the bloom's pace opens the cup in about 270 ms
		expect(OPENING_MS).toBeGreaterThan(250);
		expect(OPENING_MS).toBeLessThan(300);
	});

	it("opens faster where the walls are farther, as the bloom from that seat grows faster", () => {
		expect(framesToOpen({ x: 30, y: 30, radius: 20 })).toBeLessThan(OPEN_FRAMES);
	});

	it("opens the cup steadily, from nothing to its full size", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, OPENING_MS);
		expect(frames[0].opened).toBeLessThan(0.05);
		for (let i = 1; i < frames.length; i++) {
			expect(frames[i].opened).toBeGreaterThan(frames[i - 1].opened);
		}
		expect(frames[OPEN_FRAMES - 1].opened).toBe(1);
	});

	it("keeps the dot copy on the seat and counts no hold until fully open, however tilted", () => {
		for (const tilt of [LEVEL, TIPPED]) {
			const { frames } = play(OPEN_GET_READY, tilt, OPENING_MS);
			for (const f of frames) {
				expect(f.dot).toEqual({ x: seat.x, y: seat.y });
				expect(f.portal.radius).toBeLessThanOrEqual(CUP_RADIUS);
				expect(f.fired).toBe(false);
			}
		}
	});

	it("counts the level hold from the frame after it is fully open", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, OPENING_MS + FRAME_DT * 3);
		expect(frames[OPEN_FRAMES - 1].portal.radius).toBe(CUP_RADIUS);
		expect(frames[OPEN_FRAMES].portal.radius).toBeGreaterThan(CUP_RADIUS);
	});

	it("fires the level hold's length after it is fully open", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, PLENTY);
		const at = frames.findIndex((f) => f.fired);
		expect((at + 1 - OPEN_FRAMES) * FRAME_DT).toBeGreaterThanOrEqual(HOLD_MS);
		expect((at - OPEN_FRAMES) * FRAME_DT).toBeLessThan(HOLD_MS);
	});

	it("wears the bloom's rim, steady and in full, from its first frame while opening", () => {
		const { frames } = play(OPEN_GET_READY, TIPPED, OPENING_MS);
		for (const f of frames) expect(f.rim).toBe(RIM);
	});

	it("pulses the rim only once open, taking over from the opening's rim with no jump", () => {
		const { frames } = play(OPEN_GET_READY, TIPPED, OPENING_MS + 2000);
		const opening = frames.slice(0, OPEN_FRAMES).map((f) => f.rim);
		const open = frames.slice(OPEN_FRAMES).map((f) => f.rim);
		expect(Math.max(...open) - Math.min(...open)).toBeGreaterThan(0.3);
		// The pulse takes over where the opening left off: no jump
		expect(Math.abs(open[0] - opening[opening.length - 1])).toBeLessThan(0.05);
	});

	it("keeps the dot inside the cup, however the phone is tilted", () => {
		const { frames } = play(OPEN_GET_READY, { x: 3, y: -2 }, 2000);
		for (const f of frames) {
			expect(Math.hypot(f.dot.x - seat.x, f.dot.y - seat.y)).toBeLessThan(TRAVEL + 20);
		}
		const last = frames[frames.length - 1];
		expect(Math.hypot(last.dot.x - seat.x, last.dot.y - seat.y)).toBeCloseTo(TRAVEL, 0);
	});
});

describe("get-ready finger lifted before the cup is open", () => {
	it("drains the cup back into the seat faster than it grew, and shuts Get ready", () => {
		const half = Math.floor(OPEN_FRAMES / 2);
		const opening = play(OPEN_GET_READY, LEVEL, half * FRAME_DT);
		const { frames } = play(opening.state, LEVEL, 1000, seat, false);
		const at = frames.findIndex((f) => f.shut);
		expect(at).toBeGreaterThan(0);
		expect(frames.filter((f) => f.shut)).toHaveLength(1);
		expect(at + 1).toBeLessThan(half);
		const radii = frames.slice(0, at + 1).map((f) => f.portal.radius);
		for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThan(radii[i - 1]);
		expect(radii[at]).toBe(0);
		for (const f of frames) {
			expect(f.portal.x).toBe(seat.x);
			expect(f.fired).toBe(false);
		}
	});
});

describe("get-ready frame step", () => {
	it("fires on exactly one frame, and is inert after it", () => {
		const { state, frames } = play(OPEN_GET_READY, LEVEL, PLENTY);
		const firing = frames.filter((f) => f.fired);
		expect(firing).toHaveLength(1);
		const at = frames.indexOf(firing[0]);
		const open = { x: seat.x, y: seat.y, radius: portalReach(seat, field), inside: "play" };
		expect(firing[0].portal).toEqual(open);
		for (const after of frames.slice(at + 1)) {
			expect(after.fired).toBe(false);
			expect(after.portal).toEqual(open);
		}
		const tipped = advanceGetReady(state, {
			seat,
			held: false,
			tilt: { x: 0.5, y: 0.5 },
			dt: FRAME_DT,
			field,
			sensitivity: 1,
		});
		expect(tipped.state).toBe(state);
		expect(tipped.frame.fired).toBe(false);
		expect(tipped.frame.shut).toBe(false);
		expect(tipped.frame.portal).toEqual(open);
	});

	it("grows the portal with the hold and shrinks it when the hold breaks", () => {
		const { state, frames } = play(OPEN_GET_READY, LEVEL, OPENING_MS + HOLD_MS / 2);
		const held = frames.slice(OPEN_FRAMES).map((f) => f.portal.radius);
		for (let i = 1; i < held.length; i++) expect(held[i]).toBeGreaterThan(held[i - 1]);
		const broken = play(state, { x: 0.3, y: 0 }, 160).frames.map((f) => f.portal.radius);
		expect(broken[0]).toBeLessThan(held[held.length - 1]);
		for (let i = 1; i < broken.length; i++) expect(broken[i]).toBeLessThan(broken[i - 1]);
	});

	it("rolls the dot off the seat with the tilt and back home when level", () => {
		const first = play(OPEN_GET_READY, LEVEL, FRAME_DT).frames[0];
		expect(first.dot).toEqual({ x: seat.x, y: seat.y });
		const away = play(OPEN_GET_READY, { x: 0.2, y: 0 }, OPENING_MS + 1000);
		expect(away.frames[away.frames.length - 1].dot.x).toBeCloseTo(seat.x + 30, 0);
		const home = play(away.state, LEVEL, 1000).frames;
		expect(home[home.length - 1].dot.x).toBeCloseTo(seat.x, 0);
	});

	it("breathes the portal by this frame's roll, not the last frame's", () => {
		const reach = portalReach(seat, field);
		const homeReach = seat.radius * 1.5;
		const off = (f: GetReadyFrame) => Math.hypot(f.dot.x - seat.x, f.dot.y - seat.y);
		// Tipped hard off level, so the hold never grows and the dot rolls off the seat
		const { frames } = play(OPEN_GET_READY, TIPPED, 1000);
		// The frame the dot leaves home on: on the last frame it was still home
		const left = frames.findIndex((f) => off(f) >= homeReach);
		expect(left).toBeGreaterThan(0);
		const before = frames[left - 1];
		expect(off(before)).toBeLessThan(homeReach);
		// The pulse's clock starts as the cup is fully open
		expect(left).toBeGreaterThanOrEqual(OPEN_FRAMES);
		const pulse = seatPulse((left + 1 - OPEN_FRAMES) * FRAME_DT);
		// Away from home the portal breathes in full; by the last frame's roll it would breathe less
		expect(frames[left].portal.radius).toBeCloseTo(portalRadius(0, reach, pulse), 9);
		const lagging = portalRadius(0, reach, pulse * (1 - seated(before.dot, seat)));
		expect(frames[left].portal.radius).toBeGreaterThan(lagging);
	});

	it("fades the rim out as the portal passes the walls, gone by the firing frame", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, PLENTY);
		const at = frames.findIndex((f) => f.fired);
		const rims = frames.slice(OPEN_FRAMES - 1, at + 1).map((f) => f.rim);
		expect(rims[0]).toBeGreaterThan(0.5);
		for (let i = 1; i < rims.length; i++) expect(rims[i]).toBeLessThanOrEqual(rims[i - 1]);
		expect(rims[Math.floor(rims.length / 2)]).toBe(rims[0]);
		expect(rims[rims.length - 1]).toBe(0);
		expect(frames.slice(at).every((f) => f.rim === 0)).toBe(true);
	});

	it("shows the bowl's glass in full at the portal's edge from the first frame it opens", () => {
		const { frames } = play(OPEN_GET_READY, TIPPED, OPENING_MS + 1000);
		for (const f of frames) expect(f.glass).toBe(1);
	});

	it("fades the glass out as the portal passes the walls, gone by the firing frame", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, PLENTY);
		const at = frames.findIndex((f) => f.fired);
		const glass = frames.slice(OPEN_FRAMES - 1, at + 1).map((f) => f.glass);
		for (let i = 1; i < glass.length; i++) expect(glass[i]).toBeLessThanOrEqual(glass[i - 1]);
		expect(glass[Math.floor(glass.length / 2)]).toBe(1);
		expect(glass[glass.length - 1]).toBe(0);
	});

	it("takes the glass away with the cup when it shuts, and shows none without a player", () => {
		const { frames } = play(halfHeld(), LEVEL, 400, seat, false);
		expect(frames.find((f) => f.shut)?.glass).toBe(0);
		expect(play(OPEN_GET_READY, LEVEL, PLENTY, null).frames.every((f) => f.glass === 0)).toBe(true);
	});

	it("beats the rim with the pulse while the dot is away from home", () => {
		const away = play(OPEN_GET_READY, TIPPED, OPENING_MS + 2000).frames.map((f) => f.rim);
		expect(Math.max(...away) - Math.min(...away)).toBeGreaterThan(0.3);
	});

	it("draws the seat, the dot and the rim when the frozen scene has a player", () => {
		const first = play(OPEN_GET_READY, LEVEL, FRAME_DT).frames[0];
		expect(first.drawn).toBe(true);
		expect(first.seat).toEqual(seat);
	});

	it("draws nothing and keeps the field frosted all over when the frozen scene has no player", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, PLENTY, null);
		for (const f of frames) {
			expect(f.drawn).toBe(false);
			expect(f.portal).toEqual(PAUSE_ALL);
			expect(f.opened).toBe(0);
		}
	});
});

describe("get-ready finger lifted once the cup is open", () => {
	it("shuts the cup, faster than it opened, and is inert after the frame it shut on", () => {
		const { state, frames } = play(halfHeld(), LEVEL, 400, seat, false);
		const shutting = frames.filter((f) => f.shut);
		expect(shutting).toHaveLength(1);
		const at = frames.indexOf(shutting[0]);
		expect(at).toBeGreaterThan(0);
		expect((at + 1) * FRAME_DT).toBeLessThan(OPENING_MS);
		const radii = frames.slice(0, at + 1).map((f) => f.portal.radius);
		for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThan(radii[i - 1]);
		expect(radii[at]).toBe(0);
		expect(shutting[0].rim).toBe(0);
		expect(shutting[0].opened).toBe(0);
		for (const after of frames.slice(at + 1)) {
			expect(after.shut).toBe(false);
			expect(after.portal.radius).toBe(0);
		}
		const inert = advanceGetReady(state, {
			seat,
			held: true,
			tilt: LEVEL,
			dt: FRAME_DT,
			field,
			sensitivity: 1,
		});
		expect(inert.state).toBe(state);
	});

	it("never fires once the finger has lifted, however long the phone stays level", () => {
		const { frames } = play(halfHeld(), LEVEL, HOLD_MS * 2, seat, false);
		expect(frames.some((f) => f.fired)).toBe(false);
	});

	it("drains the hold while the finger is up", () => {
		const held = halfHeld();
		const lifted = play(held, LEVEL, FRAME_DT, seat, false);
		expect(lifted.state.hold.progress).toBeLessThan(held.hold.progress);
	});

	it("opens again if the finger comes back before the cup has shut", () => {
		const slipped = play(halfHeld(), LEVEL, FRAME_DT, seat, false);
		expect(slipped.frames[0].shut).toBe(false);
		const back = play(slipped.state, LEVEL, FRAME_DT * 3);
		expect(back.frames.some((f) => f.shut)).toBe(false);
		expect(back.frames[back.frames.length - 1].opened).toBe(1);
		expect(back.frames[back.frames.length - 1].portal.radius).toBeGreaterThan(CUP_RADIUS);
	});
});

describe("get-ready close", () => {
	it("leaves the portal as it is after firing, so the pause world goes behind it unseen", () => {
		const { state, frames } = play(OPEN_GET_READY, LEVEL, PLENTY);
		expect(frames.some((f) => f.fired)).toBe(true);
		const open = frames[frames.length - 1].portal;
		expect(closeGetReady(state, open)).toBe(open);
	});

	it("frosts the field all over when closed mid-hold, so the pause screen is frosted all over", () => {
		const { state, frames } = play(OPEN_GET_READY, LEVEL, OPENING_MS + HOLD_MS / 2);
		expect(frames.some((f) => f.fired)).toBe(false);
		const widening = frames[frames.length - 1].portal;
		expect(widening.radius).toBeGreaterThan(CUP_RADIUS);
		expect(closeGetReady(state, widening)).toEqual(PAUSE_ALL);
	});

	it("frosts the field all over once the cup has shut", () => {
		const { state, frames } = play(halfHeld(), LEVEL, 400, seat, false);
		expect(closeGetReady(state, frames[frames.length - 1].portal)).toEqual(PAUSE_ALL);
	});
});
