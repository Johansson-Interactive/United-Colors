import type { BestVerdict } from "../../application/GameStore";
import { SMALL_DOT_SIZE_RATIO } from "../../domain/constants";
import type { RunCatch } from "../../domain/types";
import {
	POUR_MAX_RADIUS,
	POUR_START_MS,
	type PourFlight,
	planPour,
} from "../../presentation/effects/pourRun";
import {
	amberLevel,
	bestRow,
	bonusSpot,
	easeToward,
	landingKick,
	POUR_DELAY_MS,
	pourBody,
	pourFit,
	pourInput,
	startPour,
	stepPour,
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
	const RED = "#E53935";
	// A catch and the next in its combo: a score of 4, half of it combo bonus
	const plan = planPour({
		record: {
			catches: [
				{ tick: 10, value: 1, step: 1, color: RED, point: false },
				{ tick: 11, value: 3, step: 2, color: RED, point: false },
			],
			ticks: 60,
		},
		color: RED,
		pitch: 14,
	});
	const radius = plan.settledDrop.radius;

	it("sits beside the drop, its middle halfway down the amber layer, as the pour is scaled", () => {
		const spot = bonusSpot(plan, { width: 400, height: 600 }, { scale: 0.5, half: 100 });
		// Half the drop is amber, so its layer runs from the centre down: its middle is r / 2 down
		expect(spot.top + spot.height / 2).toBeCloseTo(300 + 0.5 * (radius / 2));
		expect(spot.left).toBeGreaterThan(200 + 0.5 * radius - spot.pitch);
		expect(spot.left + spot.width / 2).toBeGreaterThan(200 + 0.5 * radius);
		expect(spot.pitch).toBe(3);
	});

	it("closes its dots up to keep the label on a narrow screen", () => {
		const width = 2 * radius + 30;
		const spot = bonusSpot(plan, { width, height: 600 }, { scale: 1, half: 100 });
		expect(spot.pitch).toBeLessThan(3);
		expect(spot.left + spot.width).toBeLessThanOrEqual(width);
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
	const onTop = (point: boolean, radius: number) => ({ x: 0, y: -radius, point });
	const speed = ({ x, y }: { x: number; y: number }) => Math.hypot(x, y);

	it("knocks the drop down, harder for a point dot and for a bigger drop", () => {
		const down = landingKick(onTop(false, 20), 20);
		expect(Math.abs(down.x)).toBe(0);
		expect(down.y).toBeGreaterThan(0);
		expect(speed(landingKick(onTop(true, 20), 20))).toBeGreaterThan(
			speed(landingKick(onTop(false, 20), 20)),
		);
		expect(speed(landingKick(onTop(false, 60), 60))).toBeGreaterThan(
			speed(landingKick(onTop(false, 20), 20)),
		);
	});

	it("knocks in from where the catch lands, toward the drop's centre", () => {
		const kick = landingKick({ x: 12, y: -16, point: false }, 20);
		expect(kick.x).toBeLessThan(0);
		expect(kick.x / kick.y).toBeCloseTo(-12 / 16);
		expect(speed(kick)).toBeCloseTo(speed(landingKick(onTop(false, 20), 20)));
	});

	it("knocks straight down when the catch lands on a drop with no size yet", () => {
		const kick = landingKick({ x: 0, y: 0, point: false }, 9);
		expect(Math.abs(kick.x)).toBe(0);
		expect(kick.y).toBeGreaterThan(0);
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
	/** A free small dot's radius in play (px), at the game's default density */
	const SMALL = (SMALL_DOT_SIZE_RATIO * 400) / 2;
	/** A catch on its way down onto the top of a drop of radius 40, unless told otherwise */
	const flight = (more: Partial<PourFlight>): PourFlight => ({
		color: RED,
		x: 0,
		y: -40,
		fall: 0,
		merge: 0,
		...more,
	});
	/** The body's circles, the drop's first, and its bead catches, drawn at `scale` */
	function draw(flights: PourFlight[], radius = 40, amber = 0, scale = 1) {
		const body = pourBody({ flights, color: RED, radius, jelly: STILL, top: TOP, amber, scale });
		const { blobs, count, blend, jelly } = mergeUniformsByName(body.values, [0, 0, 0, 1]);
		const circles: { x: number; y: number; radius: number }[] = [];
		for (let i = 0; i < count; i++) {
			circles.push({ x: blobs[i * 3], y: blobs[i * 3 + 1], radius: blobs[i * 3 + 2] });
		}
		return { body, circles, blend, jelly };
	}

	it("is the drop at the centre with its jelly, and nothing else between catches", () => {
		const jelly = { stretchX: 0.1, stretchY: 0, wobble: 3 };
		const input = { flights: [], color: RED, radius: 40, jelly, top: TOP, amber: 0, scale: 1 };
		const body = pourBody(input);
		const named = mergeUniformsByName(body.values, [0, 0, 0, 1]);
		expect(named.count).toBe(1);
		expect(named.blobs.slice(0, 3)).toEqual([0, 0, 40]);
		expect(named.jelly).toEqual([0.1, 0, 3]);
	});

	it("drops a catch from out of sight above onto the drop's top", () => {
		const start = draw([flight({ fall: 0 })]).circles[1];
		expect(start.y + start.radius).toBeLessThanOrEqual(TOP);
		const landing = draw([flight({ fall: 1 })]).circles[1];
		expect(landing).toEqual({ x: 0, y: -(40 + SMALL), radius: SMALL });
		const halfway = draw([flight({ fall: 0.5 })]).circles[1];
		expect(halfway.y).toBeGreaterThan(start.y);
		expect(halfway.y).toBeLessThan(landing.y);
	});

	it("drops an off-centre catch straight down, resting on the drop where it lands", () => {
		// 24 px to the right on a drop of 40, so 32 px up: a 3-4-5 triangle
		const spot = { x: 24, y: -32 };
		const start = draw([flight({ ...spot, fall: 0 })]).circles[1];
		const halfway = draw([flight({ ...spot, fall: 0.5 })]).circles[1];
		const landing = draw([flight({ ...spot, fall: 1 })]).circles[1];
		expect(start.x).toBeCloseTo(landing.x);
		expect(halfway.x).toBeCloseTo(landing.x);
		// It touches the drop at the spot: its centre on the line out of the drop's through it
		expect(landing.x).toBeCloseTo((24 / 40) * (40 + SMALL));
		expect(landing.y).toBeCloseTo((-32 / 40) * (40 + SMALL));
	});

	it("drops every catch, point dots too, at a small dot's size in play on screen", () => {
		// The pour drawn at half size draws its catches twice as big, to be the same on screen
		expect(draw([flight({ fall: 1 })], 40, 0, 0.5).circles[1].radius * 0.5).toBeCloseTo(SMALL);
		const bead = draw([flight({ color: BLUE, fall: 1 })], 40, 0, 0.5).body.beads[0];
		expect(bead.radius * 0.5).toBeCloseTo(SMALL);
	});

	it("merges a landed catch into the drop's centre, shrinking as it goes, as in play", () => {
		const merged = draw([flight({ x: 24, y: -32, fall: 1, merge: 1 })]).circles[1];
		expect(merged.x).toBeCloseTo(0);
		expect(merged.y).toBeCloseTo(0);
		expect(merged.radius).toBeLessThan(SMALL);
		expect(merged.radius).toBeGreaterThan(0);
	});

	it("draws a catch of another colour than the drop as a bead of its own", () => {
		const { body, circles } = draw([flight({ fall: 1 }), flight({ color: BLUE, fall: 0.5 })]);
		expect(circles).toHaveLength(2);
		expect(body.beads).toHaveLength(1);
		expect(body.beads[0].color).toBe(BLUE);
		expect(body.beads[0].radius).toBe(SMALL);
	});

	it("still blends a first catch into a drop that has no size yet", () => {
		expect(draw([flight({ fall: 1 })], 0).blend).toBeGreaterThan(0);
	});

	it("has no drop in it before the first catch lands, and fills nothing without a catch", () => {
		const { circles } = draw([flight({ x: 0, y: 0, fall: 0.5 })], 0);
		expect(circles).toHaveLength(1);
		expect(circles[0].radius).toBe(SMALL);
		const empty = draw([], 0);
		expect(empty.circles).toHaveLength(0);
		expect(empty.body.width * empty.body.height).toBe(0);
	});

	it("fills a rect holding the drop and every catch in it", () => {
		const { body, circles } = draw([
			flight({ x: -24, y: -32, fall: 0.2 }),
			flight({ x: 24, y: -32, fall: 1 }),
			flight({ fall: 1, merge: 0.5 }),
		]);
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

describe("stepPour", () => {
	const RED = "#E53935";
	const FRAME = 1000 / 60;
	const T0 = 5000;
	const pour = planPour({
		record: {
			catches: [
				{ tick: 10, value: 1, step: 1, color: RED, point: false },
				{ tick: 11, value: 3, step: 2, color: RED, point: false },
				{ tick: 90, value: 1, step: 1, color: RED, point: false },
			],
			ticks: 120,
		},
		color: RED,
		pitch: 14,
	});
	/** Replay time `ms` as a UI frame time, the first frame at T0 */
	const frameAt = (ms: number) => T0 + POUR_DELAY_MS + ms;

	/** Step every frame from T0 up to `untilMs` of replay time, keeping what each step said */
	function play(untilMs: number) {
		let playback = startPour(pour);
		const steps: NonNullable<ReturnType<typeof stepPour>>[] = [];
		for (let now = T0, last = T0; now <= frameAt(untilMs); last = now, now += FRAME) {
			const step = stepPour(pour, playback, now, now - last);
			if (!step) break;
			steps.push(step);
			playback = step.playback;
		}
		return { playback, steps };
	}

	it("starts its clock on the first frame, the delay before the replay", () => {
		const first = stepPour(pour, startPour(pour), T0, 0);
		expect(first?.playback.frame.view.clock).toBe("0:00");
		expect(first?.playback.frame.view.drop.tally).toBe(0);
		expect(play(POUR_START_MS + FRAME).playback.frame.view.drop.tally).toBe(1);
	});

	it("cues each landing once, kicks the drop down and adds the landing's bursts", () => {
		const { steps } = play(POUR_START_MS + 200);
		const landed = steps.flatMap((s) => s.landings);
		expect(landed.map((l) => l.pitch)).toEqual([0, 1]);
		const second = steps.findIndex((s) => s.landings.some((l) => l.pitch === 1));
		const before = steps[second - 1].playback;
		const after = steps[second].playback;
		expect(after.body.lagVY).toBeGreaterThan(before.body.lagVY);
		expect(after.frame.bursts.length).toBe(before.frame.bursts.length + 1);
		expect(after.frame.bursts.at(-1)?.kind).toBe("pop");
	});

	it("pushes the liquid away from where an off-centre catch lands, sideways as well as down", () => {
		const { steps } = play(POUR_START_MS + 2400);
		const at = steps.findIndex(
			(s) => s.landings.length > 0 && s.playback.frame.view.drop.tally > 4,
		);
		const [last] = steps[at].landings;
		const { radius } = steps[at - 1].playback.frame.view.drop;
		expect(Math.abs(last.x)).toBeGreaterThan(0.2 * radius);
		expect(steps[at - 1].playback.frame.jelly.stretchX).toBeCloseTo(0, 3);
		// A few frames on, the drop is drawn out across, the mass thrown away from the landing
		const { jelly } = steps[at + 3].playback.frame;
		expect(Math.sign(jelly.stretchX)).toBe(-Math.sign(last.x));
		expect(Math.abs(jelly.stretchX)).toBeGreaterThan(0.01);
		expect(jelly.stretchY).toBeGreaterThan(0);
	});

	it("eases the drawn drop toward the stepper's", () => {
		const { playback } = play(POUR_START_MS + FRAME);
		expect(playback.frame.radius).toBeGreaterThan(0);
		expect(playback.frame.radius).toBeLessThan(playback.frame.view.drop.radius);
	});

	it("integrates no more than a short frame's worth of a stall", () => {
		const { playback } = play(POUR_START_MS + 100);
		const now = frameAt(POUR_START_MS + 100) + 400;
		const stalled = stepPour(pour, playback, now, 400);
		const short = stepPour(pour, playback, now, 100);
		expect(stalled?.playback.body).toEqual(short?.playback.body);
	});

	it("reports the status only when what the interface shows changes", () => {
		const { steps } = play(POUR_START_MS + 300);
		const first = startPour(pour).status;
		expect(first).toEqual({ clock: "0:00", tally: 0, settled: false });
		const reported = [first, ...steps.filter((s) => s.status !== null).map((s) => s.status)];
		for (let i = 1; i < reported.length; i++) expect(reported[i]).not.toEqual(reported[i - 1]);
		expect(reported.map((s) => s?.tally)).toContain(4);
		expect(reported.length).toBeLessThan(steps.length);
	});

	it("stops once settled, its liquid at rest and its bursts over, and stays stopped", () => {
		const { playback, steps } = play(20_000);
		const last = steps.at(-1)?.playback;
		expect(last?.done).toBe(true);
		expect(last?.frame.view.settled).toBe(true);
		expect(last?.frame.bursts).toEqual([]);
		expect(last?.status.settled).toBe(true);
		// It runs on past the settling only until the slosh dies down
		expect(steps.length * FRAME).toBeGreaterThan(POUR_DELAY_MS + pour.settleMs);
		expect(steps.length * FRAME).toBeLessThan(POUR_DELAY_MS + pour.settleMs + 3000);
		expect(stepPour(pour, playback, frameAt(30_000), FRAME)).toBeNull();
	});
});
