import type { BestVerdict } from "../../application/GameStore";
import type { RunCatch } from "../../domain/types";
import { POUR_DOT_RADIUS, POUR_MAX_RADIUS, planPour } from "../../presentation/effects/pourRun";
import {
	amberLevel,
	bestRow,
	bonusSpot,
	easeToward,
	landingKick,
	pourBody,
	pourFit,
	pourInput,
} from "../../presentation/effects/pourScene";
import { mergeUniformsByName } from "../../presentation/mergeShader";

describe("pourFit", () => {
	const PITCH = 14;
	const scored = (catches: number, value: number) =>
		planPour({
			record: {
				catches: Array.from(
					{ length: catches },
					(_, i): RunCatch => ({ tick: i + 1, value, step: 1, color: "#E53935", point: false }),
				),
				ticks: 300,
			},
			color: "#E53935",
			pitch: PITCH,
		});

	it("keeps a small run at full size, its slot holding the score's digits", () => {
		const fit = pourFit(scored(9, 1), PITCH, 600);
		expect(fit.scale).toBe(1);
		// A digit is seven dots tall: three pitches from its middle row to its outer ones, and a dot
		expect(fit.half).toBeCloseTo(3 * PITCH + 0.38 * PITCH);
	});

	it("holds the settled drop", () => {
		const fit = pourFit(scored(200, 5), PITCH, 600);
		expect(fit.scale).toBe(1);
		expect(fit.half).toBeGreaterThanOrEqual(POUR_MAX_RADIUS);
	});

	it("shrinks a 1000 point drop to fit a short screen", () => {
		const fit = pourFit(scored(200, 5), PITCH, 200);
		expect(fit.scale).toBeLessThan(1);
		expect(fit.half).toBeLessThanOrEqual(100);
		expect(fit.half).toBeGreaterThanOrEqual(POUR_MAX_RADIUS * fit.scale);
	});
});

describe("pourInput", () => {
	const RED = "#E53935";
	const run = { catches: [], ticks: 90 };
	const frame = (score: number) => ({
		phase: "GAME_OVER" as const,
		score,
		dots: [],
		events: [],
		run,
	});

	it("pours the frame's run in the player's colour", () => {
		expect(pourInput({ frame: frame(30) }, RED)).toEqual({ record: run, color: RED, pitch: 14 });
	});

	it("sets a score of four digits or more closer, as the game over always has", () => {
		expect(pourInput({ frame: frame(999) }, RED).pitch).toBe(14);
		expect(pourInput({ frame: frame(1000) }, RED).pitch).toBe(11);
	});

	it("pours an empty run when the frame carries none", () => {
		const bare = { phase: "GAME_OVER" as const, score: 0, dots: [], events: [] };
		const input = pourInput({ frame: bare }, RED);
		expect(input.record).toEqual({ catches: [], ticks: 0 });
	});
});

describe("bonusSpot", () => {
	it("sits beside the drop, halfway down its amber layer", () => {
		const spot = bonusSpot(40, 0.5);
		expect(spot.x).toBeGreaterThan(40);
		expect(spot.y).toBeCloseTo(20);
	});
});

describe("easeToward", () => {
	it("moves part of the way each frame, never past, and holds on a redraw", () => {
		const first = easeToward(0, 10, 16);
		expect(first).toBeGreaterThan(0);
		expect(first).toBeLessThan(10);
		expect(easeToward(first, 10, 0)).toBe(first);
		let x = 0;
		for (let i = 0; i < 60; i++) x = easeToward(x, 10, 16);
		expect(x).toBeLessThanOrEqual(10);
		expect(x).toBeCloseTo(10, 2);
	});
});

describe("landingKick", () => {
	it("knocks the drop down, harder for a point dot and for a bigger drop", () => {
		expect(landingKick(20, false)).toBeGreaterThan(0);
		expect(landingKick(20, true)).toBeGreaterThan(landingKick(20, false));
		expect(landingKick(60, false)).toBeGreaterThan(landingKick(20, false));
	});
});

/** The pour at a moment, as the best row reads it */
const at = (tally: number, settled = false) => ({ tally, settled });

describe("bestRow", () => {
	const newBest: BestVerdict = { best: 40, newBest: true, previous: 25 };
	const notBest: BestVerdict = { best: 60, newBest: false, previous: 60 };

	it("shows nothing until the run is judged", () => {
		expect(bestRow(at(0), null)).toEqual({ kind: "none" });
		expect(bestRow(at(40, true), null)).toEqual({ kind: "none" });
	});

	it("shows the best to beat until the tally passes it, then nothing until it settles", () => {
		expect(bestRow(at(0), newBest)).toEqual({ kind: "best", best: 25 });
		expect(bestRow(at(25), newBest)).toEqual({ kind: "best", best: 25 });
		expect(bestRow(at(26), newBest)).toEqual({ kind: "none" });
		expect(bestRow(at(40), newBest)).toEqual({ kind: "none" });
	});

	it("judges the tally against the best before the run, however late the verdict lands", () => {
		// By the time the verdict lands the store's best is already the run's own score; the
		// caption still goes out once the tally passes the best the run beat
		expect(bestRow(at(30), newBest)).toEqual({ kind: "none" });
	});

	it("celebrates a new best only once the drop has settled", () => {
		expect(bestRow(at(40, true), newBest)).toEqual({ kind: "newBest" });
	});

	it("keeps the best caption throughout a run that did not beat it", () => {
		expect(bestRow(at(10), notBest)).toEqual({ kind: "best", best: 60 });
		expect(bestRow(at(60, true), notBest)).toEqual({ kind: "best", best: 60 });
	});
});

describe("amberLevel", () => {
	it("is the bottom of the drop with no combo bonus and its top with only bonus", () => {
		expect(amberLevel(0)).toBeCloseTo(1);
		expect(amberLevel(1)).toBeCloseTo(-1);
	});

	it("cuts the drop's area at the bonus's share", () => {
		expect(amberLevel(0.5)).toBeCloseTo(0);
		// The segment below a line half a radius under the centre: acos(0.5) - 0.5 sin(acos(0.5))
		const segment = (Math.acos(0.5) - 0.5 * Math.sqrt(0.75)) / Math.PI;
		expect(amberLevel(segment)).toBeCloseTo(0.5, 4);
		expect(amberLevel(1 - segment)).toBeCloseTo(-0.5, 4);
	});
});

describe("pourBody", () => {
	const RED = "#E53935";
	const BLUE = "#1E88E5";
	const STILL = { stretchX: 0, stretchY: 0, wobble: 0 };
	const TOP = -300;
	const flight = (
		more: Partial<{ color: string; point: boolean; fall: number; merge: number }>,
	) => ({
		color: RED,
		point: false,
		fall: 0,
		merge: 0,
		...more,
	});
	/** The body's circles after the drop, as (y, radius), and its bead catches */
	function draw(flights: ReturnType<typeof flight>[], radius = 40, amber = 0) {
		const body = pourBody({ flights, color: RED, radius, jelly: STILL, top: TOP, amber });
		const { blobs, count, blend, jelly } = mergeUniformsByName(body.values, [0, 0, 0, 1]);
		const circles: { x: number; y: number; radius: number }[] = [];
		for (let i = 0; i < count; i++) {
			circles.push({ x: blobs[i * 3], y: blobs[i * 3 + 1], radius: blobs[i * 3 + 2] });
		}
		return { body, circles, blend, jelly };
	}

	it("is the drop at the centre with its jelly, and nothing else between catches", () => {
		const jelly = { stretchX: 0.1, stretchY: 0, wobble: 3 };
		const body = pourBody({ flights: [], color: RED, radius: 40, jelly, top: TOP, amber: 0 });
		const named = mergeUniformsByName(body.values, [0, 0, 0, 1]);
		expect(named.count).toBe(1);
		expect(named.blobs.slice(0, 3)).toEqual([0, 0, 40]);
		expect(named.jelly).toEqual([0.1, 0, 3]);
	});

	it("drops a catch from out of sight above onto the drop's top", () => {
		const start = draw([flight({ fall: 0 })]).circles[1];
		expect(start.y + start.radius).toBeLessThanOrEqual(TOP);
		const landing = draw([flight({ fall: 1 })]).circles[1];
		expect(landing).toEqual({ x: 0, y: -(40 + POUR_DOT_RADIUS), radius: POUR_DOT_RADIUS });
		const halfway = draw([flight({ fall: 0.5 })]).circles[1];
		expect(halfway.y).toBeGreaterThan(start.y);
		expect(halfway.y).toBeLessThan(landing.y);
	});

	it("merges a landed catch into the drop's centre, shrinking as it goes, as in play", () => {
		const merged = draw([flight({ fall: 1, merge: 1 })]).circles[1];
		expect(merged.y).toBeCloseTo(0);
		expect(merged.radius).toBeLessThan(POUR_DOT_RADIUS);
		expect(merged.radius).toBeGreaterThan(0);
	});

	it("drops a point dot at twice a small dot's size", () => {
		expect(draw([flight({ point: true, fall: 1 })]).circles[1].radius).toBe(2 * POUR_DOT_RADIUS);
	});

	it("draws a catch of another colour than the drop as a bead of its own", () => {
		const { body, circles } = draw([flight({ fall: 1 }), flight({ color: BLUE, fall: 0.5 })]);
		expect(circles).toHaveLength(2);
		expect(body.beads).toHaveLength(1);
		expect(body.beads[0].color).toBe(BLUE);
		expect(body.beads[0].radius).toBe(POUR_DOT_RADIUS);
	});

	it("still blends a first catch into a drop that has no size yet", () => {
		expect(draw([flight({ fall: 1 })], 0).blend).toBeGreaterThan(0);
	});

	it("has no drop in it before the first catch lands, and fills nothing without a catch", () => {
		const { circles } = draw([flight({ fall: 0.5 })], 0);
		expect(circles).toHaveLength(1);
		expect(circles[0].radius).toBe(POUR_DOT_RADIUS);
		const empty = draw([], 0);
		expect(empty.circles).toHaveLength(0);
		expect(empty.body.width * empty.body.height).toBe(0);
	});

	it("fills a rect holding the drop and every catch in it", () => {
		const { body, circles } = draw([flight({ fall: 0.2 }), flight({ fall: 1, merge: 0.5 })]);
		for (const c of circles) {
			expect(c.x - c.radius).toBeGreaterThanOrEqual(body.x);
			expect(c.x + c.radius).toBeLessThanOrEqual(body.x + body.width);
			expect(c.y - c.radius).toBeGreaterThanOrEqual(body.y);
			expect(c.y + c.radius).toBeLessThanOrEqual(body.y + body.height);
		}
	});

	it("fills amber from the level of the bonus's share to the bottom", () => {
		const none = draw([], 40, 0).body;
		expect(none.amberY).toBeGreaterThanOrEqual(none.y + none.height);
		expect(draw([], 40, 0.5).body.amberY).toBeCloseTo(0);
	});
});
