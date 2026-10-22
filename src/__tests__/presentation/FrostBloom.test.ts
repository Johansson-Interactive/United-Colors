import { portalReach, restRadius } from "../../presentation/effects/portal";
import { HOLD_MS, INITIAL_GET_READY, stepGetReady } from "../../presentation/tilt/getReady";
import {
	BLOOM_MS,
	type BloomState,
	bloomFrame,
	OPEN_BLOOM,
	stepBloom,
} from "../../presentation/touch/frostBloom";

const field = { width: 400, height: 800, cornerExtent: 0 };
/** Where the finger landed */
const ORIGIN = { x: 300, y: 650 };
/** The player dot's radius: the edge opens at the rest size around it */
const DOT = 15;
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
		expect(run(almost, true, 10, 10)).toEqual({ progress: 1, open: 1, outcome: "covered" });
	});

	it("grows its edge as fast as Get ready thaws the window, so the pause and the resume match", () => {
		let bloom = OPEN_BLOOM;
		// Armed, so the hold grows from its first frame as the bloom does
		let thaw = INITIAL_GET_READY;
		for (let t = 0; t < HOLD_MS - FRAME_DT; t += FRAME_DT) {
			bloom = stepBloom(bloom, true, FRAME_DT);
			thaw = stepGetReady(thaw, 0, 0, FRAME_DT, true);
			expect(bloom.progress).toBeCloseTo(thaw.progress, 9);
		}
		expect(bloom.outcome).toBeNull();
	});

	it("covers once only, and is inert after", () => {
		const covered = run(OPEN_BLOOM, true, BLOOM_MS * 2);
		expect(covered.outcome).toBe("covered");
		expect(stepBloom(covered, true, FRAME_DT)).toBe(covered);
		expect(stepBloom(covered, false, FRAME_DT)).toBe(covered);
	});

	it("drains faster than it grew once the finger lifts, and clears when the frost is gone", () => {
		const half = run(OPEN_BLOOM, true, BLOOM_MS / 2, 15);
		expect(half.progress).toBeCloseTo(0.5, 9);
		const lifted = run(half, false, 100, 10);
		expect(lifted.progress).toBeLessThan(0.5 - 100 / BLOOM_MS);
		expect(lifted.outcome).toBeNull();
		const cleared = run(half, false, BLOOM_MS / 2, 15);
		expect(cleared).toEqual({ progress: 0, open: 0, outcome: "cleared" });
	});

	it("clears once only, and is inert after", () => {
		const cleared = run(run(OPEN_BLOOM, true, 100), false, 1000);
		expect(cleared.outcome).toBe("cleared");
		expect(stepBloom(cleared, true, FRAME_DT)).toBe(cleared);
	});

	it("clears at once when the finger was gone before the first frame", () => {
		expect(stepBloom(OPEN_BLOOM, false, FRAME_DT).outcome).toBe("cleared");
	});

	it("opens to its rest size quickly under the finger, well before the field is covered", () => {
		const opening = frames(OPEN_BLOOM, true, BLOOM_MS);
		const fullyOpen = opening.findIndex((s) => s.open === 1);
		expect(fullyOpen).toBeGreaterThan(0);
		expect(opening[fullyOpen].progress).toBeLessThan(0.4);
		for (let i = 1; i <= fullyOpen; i++)
			expect(opening[i].open).toBeGreaterThan(opening[i - 1].open);
	});

	it("grows again if the finger comes back before the frost has drained", () => {
		const slipped = run(run(OPEN_BLOOM, true, 200), false, FRAME_DT);
		expect(slipped.outcome).toBeNull();
		const back = run(slipped, true, 100);
		expect(back.progress).toBeGreaterThan(slipped.progress);
		expect(back.outcome).toBeNull();
	});
});

describe("what the bloom draws", () => {
	const rest = restRadius(DOT);
	const reach = portalReach(ORIGIN, field);

	it("frosts inside an edge centred on the finger", () => {
		const { edge } = bloomFrame(run(OPEN_BLOOM, true, 200), ORIGIN, DOT, field);
		expect(edge.inside).toBe("pause");
		expect(edge.x).toBe(ORIGIN.x);
		expect(edge.y).toBe(ORIGIN.y);
	});

	it("draws nothing before the edge has opened, and nothing once the frost has cleared", () => {
		expect(bloomFrame(OPEN_BLOOM, ORIGIN, DOT, field)).toEqual({
			edge: { ...ORIGIN, radius: 0, inside: "pause" },
			rim: 0,
		});
		const cleared = run(run(OPEN_BLOOM, true, 100), false, 1000);
		expect(bloomFrame(cleared, ORIGIN, DOT, field).edge.radius).toBe(0);
	});

	it("opens at the Get ready window's rest size around the player dot, wearing the rim in full", () => {
		const opened: BloomState = { progress: 0, open: 1, outcome: null };
		const frame = bloomFrame(opened, ORIGIN, DOT, field);
		expect(frame.edge.radius).toBe(rest);
		expect(frame.rim).toBeCloseTo(0.9, 9);
	});

	it("grows with the hold out to the field's far corner, and the rim fades as it passes the walls", () => {
		const states = frames(OPEN_BLOOM, true, BLOOM_MS * 2);
		const grown = states.map((s) => bloomFrame(s, ORIGIN, DOT, field));
		const opened = states.findIndex((s) => s.open === 1);
		for (let i = 1; i < grown.length; i++) {
			expect(grown[i].edge.radius).toBeGreaterThanOrEqual(grown[i - 1].edge.radius);
		}
		// The rim is in full once the edge has opened, and from there only fades
		for (let i = opened + 1; i < grown.length; i++) {
			expect(grown[i].rim).toBeLessThanOrEqual(grown[i - 1].rim + 1e-9);
		}
		const covered = grown[grown.length - 1];
		expect(covered.edge.radius).toBe(reach);
		expect(covered.rim).toBe(0);
		// Covering the field leaves it frosted all over, as the pause screen wants it
		expect(covered.edge.inside).toBe("pause");
	});

	it("shrinks back into the fingertip as the frost drains", () => {
		const half = run(OPEN_BLOOM, true, BLOOM_MS / 2);
		const draining = frames(half, false, BLOOM_MS).map((s) => bloomFrame(s, ORIGIN, DOT, field));
		const radii = draining.map((f) => f.edge.radius);
		expect(radii[0]).toBeLessThan(bloomFrame(half, ORIGIN, DOT, field).edge.radius);
		for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThanOrEqual(radii[i - 1]);
		expect(radii[radii.length - 1]).toBe(0);
	});
});
