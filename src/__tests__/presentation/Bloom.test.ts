import { portalReach, restRadius } from "../../presentation/effects/portal";
import { HOLD_MS, INITIAL_GET_READY, stepGetReady } from "../../presentation/tilt/getReady";
import {
	advanceBloom,
	BLOOM_MS,
	type BloomEnd,
	type BloomState,
	bloomFrame,
	bloomHeld,
	bloomOrigin,
	OPEN_BLOOM,
	openBloom,
	stepBloom,
} from "../../presentation/touch/bloom";
import { FIELD_UNTOUCHED } from "../../presentation/touch/fieldTouch";

const field = { width: 400, height: 800, cornerExtent: 0 };
/** The player dot's radius: the portal opens at the rest size around it */
const DOT = 15;
/** Where the player dot froze */
const SEAT = { x: 300, y: 650, radius: DOT };
const FRAME_DT = 16;

function run(state: BloomState, held: boolean, ms: number, dt = FRAME_DT): BloomState {
	let s = state;
	for (let t = 0; t < ms; t += dt) s = stepBloom(s, held, dt);
	return s;
}

/** Frames for `ms`, held or not, as the overlay's frame callback steps them */
function frames(from: BloomState, held: boolean, ms: number) {
	let state = from;
	const out: BloomState[] = [];
	for (let t = 0; t < ms; t += FRAME_DT) {
		state = stepBloom(state, held, FRAME_DT);
		out.push(state);
	}
	return out;
}

describe("the bloom's hold", () => {
	it("covers the field after the hold, and not before", () => {
		const almost = run(OPEN_BLOOM, true, BLOOM_MS - 10, 10);
		expect(almost.outcome).toBeNull();
		expect(almost.progress).toBeCloseTo(1 - 10 / BLOOM_MS, 9);
		expect(run(almost, true, 10, 10)).toMatchObject({ progress: 1, outcome: "covered" });
	});

	it("takes about 900 ms to reach the walls", () => {
		expect(BLOOM_MS).toBe(900);
	});

	it("grows its portal as fast as Get ready's portal widens, so the pause and the resume match", () => {
		let bloom = OPEN_BLOOM;
		// Armed, so the hold grows from its first frame as the bloom does
		let widening = INITIAL_GET_READY;
		for (let t = 0; t < HOLD_MS - FRAME_DT; t += FRAME_DT) {
			bloom = stepBloom(bloom, true, FRAME_DT);
			widening = stepGetReady(widening, 0, 0, FRAME_DT, true);
			expect(bloom.progress).toBeCloseTo(widening.progress, 9);
		}
		expect(bloom.outcome).toBeNull();
	});

	it("covers once only, and is inert after", () => {
		const covered = run(OPEN_BLOOM, true, BLOOM_MS * 2);
		expect(covered.outcome).toBe("covered");
		expect(stepBloom(covered, true, FRAME_DT)).toBe(covered);
		expect(stepBloom(covered, false, FRAME_DT)).toBe(covered);
	});

	it("drains faster than it grew once the finger lifts, and clears when the portal is back at the dot", () => {
		const half = run(OPEN_BLOOM, true, BLOOM_MS / 2, 15);
		expect(half.progress).toBeCloseTo(0.5, 9);
		const lifted = run(half, false, 100, 10);
		expect(lifted.progress).toBeLessThan(0.5 - 100 / BLOOM_MS);
		expect(lifted.outcome).toBeNull();
		const cleared = run(half, false, BLOOM_MS / 2, 15);
		expect(cleared).toMatchObject({ progress: 0, outcome: "cleared" });
	});

	it("clears once only, and is inert after", () => {
		const cleared = run(run(OPEN_BLOOM, true, 100), false, 1000);
		expect(cleared.outcome).toBe("cleared");
		expect(stepBloom(cleared, true, FRAME_DT)).toBe(cleared);
	});

	it("clears at once when the finger was gone before the first frame", () => {
		expect(stepBloom(OPEN_BLOOM, false, FRAME_DT).outcome).toBe("cleared");
	});

	it("follows a hold that never lifts as it always has", () => {
		const held = frames(OPEN_BLOOM, true, BLOOM_MS * 2);
		for (let i = 1; i < held.length; i++) {
			expect(held[i].progress).toBeGreaterThanOrEqual(held[i - 1].progress);
		}
		expect(held.some((s) => s.outcome === "cleared")).toBe(false);
		expect(held[held.length - 1].outcome).toBe("covered");
	});
});

describe("a finger landing again while the portal drains", () => {
	/** Held for 200 ms, then lifted for a frame: the portal is draining */
	const draining = () => run(run(OPEN_BLOOM, true, 200), false, FRAME_DT);

	it("grows the portal again from where it is, and opens the pause whole", () => {
		const slipped = draining();
		expect(slipped.outcome).toBeNull();
		const back = stepBloom(slipped, true, FRAME_DT);
		expect(back.progress).toBeGreaterThan(slipped.progress);
		expect(run(back, true, BLOOM_MS).outcome).toBe("covered");
	});

	it("still opens the pause whole when the finger lifts straight after landing again", () => {
		const back = stepBloom(draining(), true, FRAME_DT);
		const lifted = frames(back, false, BLOOM_MS * 2);
		for (let i = 1; i < lifted.length; i++) {
			expect(lifted[i].progress).toBeGreaterThanOrEqual(lifted[i - 1].progress);
		}
		expect(lifted[lifted.length - 1].outcome).toBe("covered");
	});

	it("drains and clears as before when no finger lands again", () => {
		expect(run(draining(), false, BLOOM_MS).outcome).toBe("cleared");
	});
});

describe("what holds the bloom", () => {
	it("follows the finger that started it", () => {
		expect(bloomHeld("finger", true)).toBe(true);
		expect(bloomHeld("finger", false)).toBe(false);
	});

	it("is held for good when a second touch started it, so it plays out to the pause with no hold", () => {
		expect(bloomHeld("secondTouch", false)).toBe(true);
		expect(run(OPEN_BLOOM, bloomHeld("secondTouch", false), BLOOM_MS * 2).outcome).toBe("covered");
	});

	it("is held for good when the dev pause dot started it, so it plays out to the pause with no hold", () => {
		expect(bloomHeld("pauseDot", false)).toBe(true);
		let state = OPEN_BLOOM;
		for (let t = 0; t < BLOOM_MS * 2; t += FRAME_DT) {
			state = stepBloom(state, bloomHeld("pauseDot", false), FRAME_DT);
		}
		expect(state.outcome).toBe("covered");
	});
});

describe("what the bloom draws", () => {
	const rest = restRadius(DOT);

	it("opens a portal into the pause centred on the seat", () => {
		const { portal } = bloomFrame(run(OPEN_BLOOM, true, 200), SEAT, field);
		expect(portal.inside).toBe("pause");
		expect(portal.x).toBe(SEAT.x);
		expect(portal.y).toBe(SEAT.y);
	});

	it("starts at the rest size around the dot, swallowing it on the first frame, wearing the rim in full", () => {
		expect(bloomFrame(OPEN_BLOOM, SEAT, field).portal.radius).toBe(rest);
		const first = bloomFrame(stepBloom(OPEN_BLOOM, true, FRAME_DT), SEAT, field);
		expect(first.portal.radius).toBeGreaterThanOrEqual(rest);
		expect(first.portal.radius).toBeLessThan(rest + 1);
		expect(first.rim).toBeCloseTo(0.9, 9);
	});

	it("grows with the hold out to the farthest corner from the seat, and the rim fades as it passes the walls", () => {
		const grown = frames(OPEN_BLOOM, true, BLOOM_MS * 2).map((s) => bloomFrame(s, SEAT, field));
		for (let i = 1; i < grown.length; i++) {
			expect(grown[i].portal.radius).toBeGreaterThanOrEqual(grown[i - 1].portal.radius);
			expect(grown[i].rim).toBeLessThanOrEqual(grown[i - 1].rim + 1e-9);
		}
		const covered = grown[grown.length - 1];
		// The seat is at (300, 650) on a 400 x 800 field: the far corner is the top left
		expect(covered.portal.radius).toBeCloseTo(Math.hypot(300, 650), 9);
		expect(covered.rim).toBe(0);
		expect(covered.portal.inside).toBe("pause");
	});

	it("still reaches every corner from a seat in a corner", () => {
		const corner = { x: 10, y: 790, radius: DOT };
		const covered = bloomFrame(run(OPEN_BLOOM, true, BLOOM_MS * 2), corner, field);
		expect(covered.portal.radius).toBeCloseTo(Math.hypot(390, 790), 9);
		expect(covered.portal.radius).toBe(portalReach(corner, field));
	});

	it("drains back into the seat, and leaves the field clear once it has", () => {
		const half = run(OPEN_BLOOM, true, BLOOM_MS / 2);
		const draining = frames(half, false, BLOOM_MS);
		const radii = draining.map((s) => bloomFrame(s, SEAT, field).portal.radius);
		expect(radii[0]).toBeLessThan(bloomFrame(half, SEAT, field).portal.radius);
		for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThanOrEqual(radii[i - 1]);
		const last = draining.filter((s) => s.outcome === null).pop() as BloomState;
		const atDot = bloomFrame(last, SEAT, field);
		expect(atDot.portal.x).toBe(SEAT.x);
		expect(atDot.portal.radius).toBeLessThan(rest * 1.1);
		expect(bloomFrame(draining[draining.length - 1], SEAT, field)).toEqual({
			portal: { x: SEAT.x, y: SEAT.y, radius: 0, inside: "pause" },
			rim: 0,
		});
	});
});

describe("where the bloom opens", () => {
	/** Where the finger landed, well away from the seat */
	const LANDED = { ...FIELD_UNTOUCHED, down: true, x: 120, y: 200 };

	it("opens a finger's bloom where the finger landed, from nothing", () => {
		expect(bloomOrigin("finger", LANDED, SEAT)).toEqual({ x: 120, y: 200, radius: 0 });
	});

	it("opens a second touch's bloom under the finger too, from nothing", () => {
		expect(bloomOrigin("secondTouch", LANDED, SEAT)).toEqual({ x: 120, y: 200, radius: 0 });
	});

	it("opens the dev pause dot's bloom at the seat, which no finger marks", () => {
		expect(bloomOrigin("pauseDot", FIELD_UNTOUCHED, SEAT)).toBe(SEAT);
	});

	it("grows a finger's portal from the fingertip to the farthest corner from it", () => {
		const origin = bloomOrigin("finger", LANDED, SEAT);
		expect(bloomFrame(OPEN_BLOOM, origin, field).portal).toEqual({
			x: 120,
			y: 200,
			radius: 0,
			inside: "pause",
		});
		const covered = bloomFrame(run(OPEN_BLOOM, true, BLOOM_MS * 2), origin, field);
		// The finger is at (120, 200) on a 400 x 800 field: the far corner is the bottom right
		expect(covered.portal.radius).toBeCloseTo(Math.hypot(280, 600), 9);
	});

	it("drains a finger's portal back into the fingertip", () => {
		const origin = bloomOrigin("finger", LANDED, SEAT);
		const draining = frames(run(OPEN_BLOOM, true, BLOOM_MS / 2), false, BLOOM_MS);
		const last = draining.filter((s) => s.outcome === null).pop() as BloomState;
		const atTip = bloomFrame(last, origin, field).portal;
		expect(atTip).toMatchObject({ x: 120, y: 200 });
		expect(atTip.radius).toBeLessThan(5);
	});
});

describe("the bloom a frame at a time", () => {
	it("opens on the portal at its rest size around the seat, with no end", () => {
		const open = openBloom(SEAT, field);
		expect(open.state).toBe(OPEN_BLOOM);
		expect(open.frame).toEqual(bloomFrame(OPEN_BLOOM, SEAT, field));
		expect(open.end).toBeNull();
	});

	it("ends covered on exactly one frame, and is inert with the same state after it", () => {
		let state = OPEN_BLOOM;
		const ends: (BloomEnd | null)[] = [];
		for (let t = 0; t < BLOOM_MS * 2; t += FRAME_DT) {
			const step = advanceBloom(state, true, FRAME_DT, SEAT, field);
			state = step.state;
			ends.push(step.end);
		}
		expect(ends.filter((end) => end !== null)).toEqual(["covered"]);
		expect(advanceBloom(state, false, FRAME_DT, SEAT, field).state).toBe(state);
	});

	it("ends cleared once a lifted finger's portal has drained", () => {
		const half = run(OPEN_BLOOM, true, BLOOM_MS / 2);
		let state = half;
		const ends: (BloomEnd | null)[] = [];
		for (let t = 0; t < BLOOM_MS; t += FRAME_DT) {
			const step = advanceBloom(state, false, FRAME_DT, SEAT, field);
			state = step.state;
			ends.push(step.end);
		}
		expect(ends.filter((end) => end !== null)).toEqual(["cleared"]);
	});
});
