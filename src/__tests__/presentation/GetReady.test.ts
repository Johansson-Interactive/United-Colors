import { cornerExtent, holdInside } from "../../domain/arena";
import type { Corners } from "../../domain/types";
import { NO_FROST_WINDOW } from "../../presentation/effects/frost";
import {
	ARMING_MS,
	advanceGetReady,
	closeGetReady,
	type GetReadyFrame,
	type GetReadyFrameState,
	type GetReadyState,
	HOLD_MS,
	INITIAL_GET_READY,
	isHolding,
	OPEN_GET_READY,
	PULSE_MS,
	type Roll,
	rimOpacity,
	rollAt,
	rollTarget,
	seated,
	seatPulse,
	stepGetReady,
	stepRoll,
	windowRadius,
	windowReach,
} from "../../presentation/tilt/getReady";

function run(state: GetReadyState, x: number, y: number, ms: number, dt = 10): GetReadyState {
	let s = state;
	for (let t = 0; t < ms; t += dt) s = stepGetReady(s, x, y, dt);
	return s;
}

describe("get-ready stepper", () => {
	it("already level at open, fires after the arming delay plus the hold, and not before", () => {
		const almost = run(INITIAL_GET_READY, 0, 0, ARMING_MS + HOLD_MS - 10);
		expect(almost.fired).toBe(false);
		expect(run(almost, 0, 0, 10).fired).toBe(true);
	});

	it("samples inside the arming delay don't count towards the hold", () => {
		const armed = run(INITIAL_GET_READY, 0, 0, ARMING_MS);
		expect(armed.progress).toBe(0);
		expect(run(armed, 0, 0, HOLD_MS - 10).fired).toBe(false);
	});

	it("a frame straddling the end of the arming delay counts only its armed part", () => {
		const s = stepGetReady(run(INITIAL_GET_READY, 0, 0, ARMING_MS - 10), 0, 0, 100);
		expect(s.progress).toBeCloseTo(90 / HOLD_MS, 9);
	});

	it("drifting off level drains the hold faster than it fills", () => {
		const held = run(INITIAL_GET_READY, 0.05, -0.05, ARMING_MS + HOLD_MS / 2);
		expect(held.progress).toBeCloseTo(0.5, 6);
		const drifted = run(held, 0.2, 0, 200);
		expect(drifted.progress).toBeLessThan(0.5 - 200 / HOLD_MS);
		expect(run(drifted, 0, 0.3, 1000).progress).toBe(0);
	});

	it("tilt on either axis alone breaks the hold", () => {
		const held = run(INITIAL_GET_READY, 0, 0, ARMING_MS + HOLD_MS / 2);
		expect(run(held, 0.12, 0, 100).progress).toBeLessThan(held.progress);
		expect(run(held, 0, -0.12, 100).progress).toBeLessThan(held.progress);
	});

	it("fires once only", () => {
		const fired = run(INITIAL_GET_READY, 0, 0, ARMING_MS + HOLD_MS * 2);
		expect(fired.fired).toBe(true);
		expect(stepGetReady(fired, 0, 0, 16)).toBe(fired);
		expect(stepGetReady(fired, 0.5, 0.5, 16)).toBe(fired);
	});
});

describe("get-ready roll target", () => {
	const field = { width: 400, height: 800, cornerExtent: 0 };
	const seat = { x: 200, y: 400, radius: 20 };
	const centre = { x: seat.x, y: seat.y };

	it("is the seat when level", () => {
		expect(rollTarget(seat, { x: 0, y: 0 }, 1, field)).toEqual(centre);
	});

	it("follows the tilt by its gain times the sensitivity", () => {
		expect(rollTarget(seat, { x: 0.2, y: -0.1 }, 1, field)).toEqual({ x: 230, y: 385 });
		expect(rollTarget(seat, { x: 0.2, y: -0.1 }, 1.5, field)).toEqual({ x: 245, y: 377.5 });
	});

	it("stays inside the playfield at each wall, sliding along it", () => {
		const far = 2;
		expect(rollTarget(seat, { x: -far, y: 0.1 }, 1, field)).toEqual({ x: 20, y: 415 });
		expect(rollTarget(seat, { x: far, y: 0.1 }, 1, field)).toEqual({ x: 380, y: 415 });
		expect(rollTarget(seat, { x: 0.1, y: -far * 2 }, 1, field)).toEqual({ x: 215, y: 20 });
		expect(rollTarget(seat, { x: 0.1, y: far * 2 }, 1, field)).toEqual({ x: 215, y: 780 });
	});

	it("stays inside the playfield in a corner", () => {
		const cornerSeat = { x: 25, y: 790, radius: 20 };
		expect(rollTarget(cornerSeat, { x: -0.5, y: 0.5 }, 1, field)).toEqual({ x: 20, y: 780 });
	});

	it.each<Corners>([
		{ radius: 55, curve: "continuous" },
		{ radius: 40, curve: "circular" },
	])("stays clear of a rounded corner ($curve), where the player slides round it", (corners) => {
		const screen = { width: 400, height: 800, corners };
		const rounded = { ...field, cornerExtent: cornerExtent(screen) };
		const dot = { x: 200, y: 400, radius: 21 };
		// Tilted hard towards every part of the screen's edge, corners included
		for (let a = 0; a < 360; a += 5) {
			const rad = (a * Math.PI) / 180;
			const tilt = { x: Math.cos(rad) * 5, y: Math.sin(rad) * 5 };
			const at = rollTarget(dot, tilt, 1, rounded);
			// The game's own bound for a dot this size leaves the dot where it is
			const held = holdInside(screen, at.x, at.y, dot.radius);
			expect(held.x).toBeCloseTo(at.x, 6);
			expect(held.y).toBeCloseTo(at.y, 6);
		}
	});
});

describe("get-ready roll", () => {
	const seat = { x: 200, y: 400, radius: 20 };
	const target = { x: 260, y: 370 };

	function roll(from: Roll, to: { x: number; y: number }, ms: number, dt = 16): Roll {
		let r = from;
		for (let t = 0; t < ms; t += dt) r = stepRoll(r, to, dt);
		return r;
	}

	it("opens at rest on the seat, and stays there while the target is the seat", () => {
		const rest = rollAt(seat);
		expect(rest).toEqual({ x: 200, y: 400, vx: 0, vy: 0 });
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
	const seat = { x: 200, y: 400, radius: 20 };

	it("counts the dot as seated on the seat, and less so as it rolls off", () => {
		expect(seated(seat, seat)).toBe(1);
		const near = seated({ x: 215, y: 400 }, seat);
		expect(near).toBeGreaterThan(0);
		expect(near).toBeLessThan(1);
		expect(seated({ x: 200, y: 460 }, seat)).toBe(0);
	});

	it("pulses on the point dot's rhythm, from rest to full and back", () => {
		expect(PULSE_MS).toBe(800);
		expect(seatPulse(0)).toBeCloseTo(0, 9);
		expect(seatPulse(PULSE_MS / 2)).toBeCloseTo(1, 9);
		expect(seatPulse(PULSE_MS)).toBeCloseTo(0, 9);
	});
});

describe("get-ready window", () => {
	const field = { width: 400, height: 800, cornerExtent: 0 };
	const seat = { x: 150, y: 300, radius: 20 };
	const reach = windowReach(seat, field);

	it("reaches from the seat to the farthest corner of the field", () => {
		expect(reach).toBeCloseTo(Math.hypot(250, 500), 9);
		expect(windowReach({ x: 200, y: 400 }, field)).toBeCloseTo(Math.hypot(200, 400), 9);
	});

	it("rests a little clear of the seat, breathing with the pulse", () => {
		const rest = windowRadius(0, seat.radius, reach, 0);
		expect(rest).toBeGreaterThan(seat.radius);
		expect(rest).toBeLessThan(seat.radius * 2);
		expect(windowRadius(0, seat.radius, reach, 1)).toBeGreaterThan(rest);
	});

	it("clears the whole field at full progress, whatever the breath", () => {
		expect(windowRadius(1, seat.radius, reach, 0)).toBe(reach);
		expect(windowRadius(1, seat.radius, reach, 1)).toBe(reach);
	});

	it("thaws outward monotonically with the hold", () => {
		let previous = 0;
		for (let p = 0; p <= 1; p += 0.05) {
			const r = windowRadius(p, seat.radius, reach, 0);
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

	it("is gone by the time the thaw has cleared the field", () => {
		expect(rimOpacity(0.3, 1, 0)).toBe(rimOpacity(0, 1, 0));
		expect(rimOpacity(0.8, 1, 0)).toBeLessThan(rimOpacity(0.6, 1, 0));
		expect(rimOpacity(1, 1, 0)).toBe(0);
		expect(rimOpacity(1, 0, 1)).toBe(0);
	});
});

describe("get-ready caption", () => {
	const frame = (state: GetReadyState, x: number) =>
		[state, stepGetReady(state, x, 0, 16)] as const;

	it("stays up while the tap's jolt is still arming", () => {
		expect(isHolding(...frame(INITIAL_GET_READY, 0))).toBe(false);
	});

	it("fades while the player holds level", () => {
		const armed = run(INITIAL_GET_READY, 0, 0, ARMING_MS + 100);
		expect(isHolding(...frame(armed, 0))).toBe(true);
	});

	it("comes back when the hold breaks, and stays while off level", () => {
		const held = run(INITIAL_GET_READY, 0, 0, ARMING_MS + HOLD_MS / 2);
		expect(isHolding(...frame(held, 0.3))).toBe(false);
		const drained = run(held, 0.3, 0, 2000);
		expect(isHolding(...frame(drained, 0.3))).toBe(false);
	});
});

describe("get-ready frame step", () => {
	const field = { width: 400, height: 800, cornerExtent: 0 };
	const seat = { x: 150, y: 300, radius: 20 };
	const LEVEL = { x: 0, y: 0 };
	/** Frames of 16 ms that fit wholly inside the arming delay; the next straddles its end and counts */
	const ARMING_FRAMES = 12;

	/** Frames of `dt` ms for `ms`, at one tilt, as the overlay's frame callback would step them */
	function play(
		from: GetReadyFrameState,
		tilt: { x: number; y: number },
		ms: number,
		dt = 16,
	): { state: GetReadyFrameState; frames: GetReadyFrame[] } {
		let state = from;
		const frames: GetReadyFrame[] = [];
		for (let t = 0; t < ms; t += dt) {
			const next = advanceGetReady(state, { seat, tilt, dt, field, sensitivity: 1 });
			state = next.state;
			frames.push(next.frame);
		}
		return { state, frames };
	}

	it("fires on exactly one frame, and is inert after it", () => {
		const { state, frames } = play(OPEN_GET_READY, LEVEL, ARMING_MS + HOLD_MS * 2);
		const firing = frames.filter((f) => f.fired);
		expect(firing).toHaveLength(1);
		const at = frames.indexOf(firing[0]);
		const open = { x: seat.x, y: seat.y, radius: windowReach(seat, field) };
		expect(firing[0].window).toEqual(open);
		for (const after of frames.slice(at + 1)) {
			expect(after.fired).toBe(false);
			expect(after.window).toEqual(open);
		}
		const tipped = advanceGetReady(state, {
			seat,
			tilt: { x: 0.5, y: 0.5 },
			dt: 16,
			field,
			sensitivity: 1,
		});
		expect(tipped.state).toBe(state);
		expect(tipped.frame.fired).toBe(false);
		expect(tipped.frame.window).toEqual(open);
	});

	it("hides the caption on the frame the hold starts growing, without flicker as it holds", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, ARMING_MS + HOLD_MS / 2);
		expect(frames.slice(0, ARMING_FRAMES).every((f) => f.caption)).toBe(true);
		expect(frames.slice(ARMING_FRAMES).every((f) => !f.caption)).toBe(true);
	});

	it("shows the caption on the frame the hold breaks, and keeps it while off level", () => {
		const held = play(OPEN_GET_READY, LEVEL, ARMING_MS + HOLD_MS / 2).state;
		const { frames } = play(held, { x: 0.3, y: 0 }, 2000);
		expect(frames.every((f) => f.caption)).toBe(true);
	});

	it("counts no hold during the arming delay: the window rests at the seat", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, ARMING_FRAMES * 16);
		expect(frames).toHaveLength(ARMING_FRAMES);
		const rest = frames[0].window.radius;
		expect(rest).toBeLessThan(seat.radius * 2);
		expect(frames.every((f) => f.window.radius === rest && !f.fired)).toBe(true);
	});

	it("grows the window with the hold and shrinks it when the hold breaks", () => {
		const { state, frames } = play(OPEN_GET_READY, LEVEL, ARMING_MS + HOLD_MS / 2);
		const held = frames.slice(ARMING_FRAMES).map((f) => f.window.radius);
		for (let i = 1; i < held.length; i++) expect(held[i]).toBeGreaterThan(held[i - 1]);
		const broken = play(state, { x: 0.3, y: 0 }, 160).frames.map((f) => f.window.radius);
		expect(broken[0]).toBeLessThan(held[held.length - 1]);
		for (let i = 1; i < broken.length; i++) expect(broken[i]).toBeLessThan(broken[i - 1]);
	});

	it("rolls the dot off the seat with the tilt and back home when level", () => {
		const first = play(OPEN_GET_READY, LEVEL, 16).frames[0];
		expect(first.dot).toEqual({ x: seat.x, y: seat.y });
		const away = play(OPEN_GET_READY, { x: 0.2, y: 0 }, 1000);
		expect(away.frames[away.frames.length - 1].dot.x).toBeCloseTo(seat.x + 30, 0);
		const home = play(away.state, LEVEL, 1000).frames;
		expect(home[home.length - 1].dot.x).toBeCloseTo(seat.x, 0);
	});

	it("breathes the window by this frame's roll, not the last frame's", () => {
		// On the seat at the top of a pulse, flung off it hard enough to leave home in one frame
		const flung: GetReadyFrameState = {
			...OPEN_GET_READY,
			hold: { ...INITIAL_GET_READY, elapsedMs: PULSE_MS / 2 - 16 },
			roll: { x: seat.x, y: seat.y, vx: 3000, vy: 0 },
		};
		const reach = windowReach(seat, field);
		const { frames } = play(flung, { x: 0.3, y: 0 }, 16);
		expect(frames[0].dot.x - seat.x).toBeGreaterThan(seat.radius * 1.5);
		// Away from home the window breathes in full; by the last frame's roll it would rest
		expect(frames[0].window.radius).toBeCloseTo(windowRadius(0, seat.radius, reach, 1), 9);
		expect(frames[0].window.radius).toBeGreaterThan(windowRadius(0, seat.radius, reach, 0));
	});

	it("fades the rim out as the thaw passes the walls, gone by the firing frame", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, ARMING_MS + HOLD_MS * 2);
		const at = frames.findIndex((f) => f.fired);
		const rims = frames.slice(0, at + 1).map((f) => f.rim);
		expect(rims[0]).toBeGreaterThan(0.5);
		for (let i = 1; i < rims.length; i++) expect(rims[i]).toBeLessThanOrEqual(rims[i - 1]);
		expect(rims[Math.floor(rims.length / 2)]).toBe(rims[0]);
		expect(rims[at]).toBe(0);
		expect(frames.slice(at).every((f) => f.rim === 0)).toBe(true);
	});

	it("beats the rim with the pulse while the dot is away from home", () => {
		const away = play(OPEN_GET_READY, { x: 0.5, y: 0 }, 2000).frames.map((f) => f.rim);
		expect(Math.max(...away) - Math.min(...away)).toBeGreaterThan(0.3);
	});

	it("draws the seat, the dot and the rim when the frozen scene has a player", () => {
		expect(play(OPEN_GET_READY, LEVEL, 16).frames[0].drawn).toBe(true);
	});

	it("draws nothing when the frozen scene has no player", () => {
		const { frame } = advanceGetReady(OPEN_GET_READY, {
			seat: null,
			tilt: LEVEL,
			dt: 16,
			field,
			sensitivity: 1,
		});
		expect(frame.drawn).toBe(false);
	});

	it("keeps the caption hidden once fired", () => {
		const { frames } = play(OPEN_GET_READY, LEVEL, ARMING_MS + HOLD_MS * 2);
		const at = frames.findIndex((f) => f.fired);
		expect(frames.slice(at).every((f) => !f.caption)).toBe(true);
	});
});

describe("get-ready close", () => {
	const field = { width: 400, height: 800, cornerExtent: 0 };
	const seat = { x: 150, y: 300, radius: 20 };
	const LEVEL = { x: 0, y: 0 };
	/** The window the frost is left with on the last frame Get ready drew */
	const open = { x: seat.x, y: seat.y, radius: 500 };

	/** Frames of 16 ms for `ms` at one tilt, as the overlay's frame callback steps them */
	function play(from: GetReadyFrameState, tilt: { x: number; y: number }, ms: number) {
		let state = from;
		for (let t = 0; t < ms; t += 16) {
			state = advanceGetReady(state, { seat, tilt, dt: 16, field, sensitivity: 1 }).state;
		}
		return state;
	}

	it("leaves the window as it is after firing, so the frost lifts behind it unseen", () => {
		const fired = play(OPEN_GET_READY, LEVEL, ARMING_MS + HOLD_MS * 2);
		expect(fired.hold.fired).toBe(true);
		expect(closeGetReady(fired, open)).toBe(open);
	});

	it("shuts the window when closed mid-hold, so the pause screen is frosted all over", () => {
		const held = play(OPEN_GET_READY, LEVEL, ARMING_MS + HOLD_MS / 2);
		expect(held.hold.fired).toBe(false);
		expect(held.hold.progress).toBeGreaterThan(0);
		expect(closeGetReady(held, open)).toEqual(NO_FROST_WINDOW);
	});

	it("shuts the window when closed during the arming delay", () => {
		const armingState = play(OPEN_GET_READY, LEVEL, ARMING_MS / 2);
		expect(armingState.hold.fired).toBe(false);
		expect(armingState.hold.progress).toBe(0);
		expect(closeGetReady(armingState, open)).toEqual(NO_FROST_WINDOW);
	});
});
