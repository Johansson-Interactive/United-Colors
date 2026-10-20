import { layoutDotMatrix } from "../../presentation/dotmatrix/layout";
import { plainKit } from "../../presentation/dotSprites";
import { BURST_COLORS, NOT_STARTED } from "../../presentation/effects/burstFrames";
import { SCORE_BUMP_MS } from "../../presentation/effects/scoreBump";
import {
	ADDEND_PITCH,
	advanceTally,
	createTally,
	DOT_STRIDE,
	DRAIN_MS,
	FEED_PITCH,
	FEED_ROWS,
	FLIGHT_MS,
	HOLD_MS,
	MAX_PENDING,
	newCatch,
	packTally,
	packTallySprites,
	SCORE_PITCH,
	SHIFT_MS,
	shownScore,
	type Tally,
	type TallyFrame,
	type TallyStyle,
	TICK_MAX_MS,
	TICK_MIN_MS,
	tallyFrame,
	tallyIdle,
	tallyInCombo,
	tallySprites,
	tickFor,
	withCatch,
} from "../../presentation/effects/scoreTally";
import { COMBO_AMBER, WHITE } from "../../presentation/theme/theme";

const PINK = BURST_COLORS[0];
const AMBER = BURST_COLORS.indexOf(COMBO_AMBER);
const GEOMETRY = { cx: 200, cy: 40 };

/** A tally of `score` with `catches` queued, advanced at `now` so each is stamped */
function tallyWith(score: number, catches: [value: number, color?: string][], now: number): Tally {
	let tally = createTally(score);
	catches.forEach(([value, color], i) => {
		tally = withCatch(tally, newCatch(i, value, color ?? PINK));
	});
	return advanceTally(tally, now);
}

function pack(tally: Tally, now: number, style: TallyStyle = "feed"): TallyFrame {
	const out = tallyFrame();
	packTally(tally, now, style, GEOMETRY, out);
	return out;
}

/** The packed dots as objects */
function dotsOf(frame: TallyFrame) {
	const dots = [];
	for (let o = 0; o < frame.dots.length; o += DOT_STRIDE) {
		const [x, y, radius, color, alpha] = frame.dots.slice(o, o + DOT_STRIDE);
		dots.push({ x, y, radius, color, alpha });
	}
	return dots;
}

/** The total's dots as objects */
function totalOf(frame: TallyFrame) {
	const dots = [];
	for (let o = 0; o < frame.total.length; o += 3) {
		const [x, y, radius] = frame.total.slice(o, o + 3);
		dots.push({ x, y, radius });
	}
	return dots;
}

describe("a catch's tick", () => {
	it("spreads the drain over the catch's points, within the bounds", () => {
		expect(tickFor(1)).toBe(TICK_MAX_MS);
		expect(tickFor(10)).toBe(DRAIN_MS / 10);
		expect(tickFor(100)).toBe(TICK_MIN_MS);
	});
});

describe("queuing a catch", () => {
	it("takes its colour from the burst colours, white for any other", () => {
		expect(newCatch(0, 5, COMBO_AMBER).color).toBe(AMBER);
		expect(newCatch(0, 5, "#123456").color).toBe(BURST_COLORS.indexOf(WHITE));
	});

	it("queues a copy the UI thread may stamp, leaving the queued catch unstamped", () => {
		const c = newCatch(0, 5, PINK);
		const tally = withCatch(createTally(0), c);
		expect(tally.catches[0]).toEqual(c);
		expect(tally.catches[0]).not.toBe(c);
		expect(c.at).toBe(NOT_STARTED);
	});

	it("counts the oldest at once when more than MAX_PENDING would queue", () => {
		let tally = createTally(10);
		for (let i = 0; i <= MAX_PENDING; i++) tally = withCatch(tally, newCatch(i, i + 1, PINK));
		expect(tally.catches).toHaveLength(MAX_PENDING);
		expect(tally.catches[0].id).toBe(1);
		expect(tally.settled).toBe(11);
	});
});

describe("advancing the tally", () => {
	it("stamps a new catch to hold a beat before its first point leaves", () => {
		const tally = tallyWith(0, [[5]], 1000);
		expect(tally.catches[0].at).toBe(1000);
		expect(tally.catches[0].start).toBe(1000 + HOLD_MS);
	});

	it("schedules a catch after the one before it has drained", () => {
		const tally = tallyWith(0, [[5], [3]], 1000);
		const [first, second] = tally.catches;
		expect(second.start).toBe(first.start + 5 * first.tick);
	});

	it("lets a catch that arrives late hold its own beat", () => {
		let tally = tallyWith(0, [[9]], 1000);
		tally = withCatch(tally, newCatch(1, 2, PINK));
		tally = advanceTally(tally, 1500);
		expect(tally.catches[1].start).toBe(1500 + HOLD_MS);
	});

	it("returns the same tally while nothing is over", () => {
		const tally = tallyWith(0, [[5]], 1000);
		expect(advanceTally(tally, 1001)).toBe(tally);
	});

	it("drops a catch once its last point has landed and the lines have closed", () => {
		const tally = tallyWith(10, [[5]], 1000);
		const c = tally.catches[0];
		const lastDepart = c.start + 4 * c.tick;
		const over = lastDepart + Math.max(FLIGHT_MS, SHIFT_MS);
		expect(advanceTally(tally, over - 1).catches).toHaveLength(1);
		const dropped = advanceTally(tally, over);
		expect(dropped.catches).toHaveLength(0);
		expect(dropped.settled).toBe(15);
		expect(dropped.lastLand).toBe(lastDepart + FLIGHT_MS);
	});
});

describe("the score shown", () => {
	it("counts a point in as it lands, and the whole catch once its last has", () => {
		const tally = tallyWith(10, [[5]], 1000);
		const { start, tick } = tally.catches[0];
		expect(shownScore(tally, start)).toBe(10);
		expect(shownScore(tally, start + FLIGHT_MS - 1)).toBe(10);
		expect(shownScore(tally, start + FLIGHT_MS)).toBe(11);
		expect(shownScore(tally, start + 2 * tick + FLIGHT_MS)).toBe(13);
		expect(shownScore(tally, start + 4 * tick + FLIGHT_MS)).toBe(15);
		expect(shownScore(tally, start + 40 * tick)).toBe(15);
	});

	it("is the score alone before a catch is stamped", () => {
		const tally = withCatch(createTally(7), newCatch(0, 5, PINK));
		expect(shownScore(tally, 99999)).toBe(7);
	});
});

describe("idling", () => {
	it("is idle with nothing queued and the last bump over", () => {
		expect(tallyIdle(createTally(0), 0)).toBe(true);
		const tally = tallyWith(0, [[1]], 1000);
		expect(tallyIdle(tally, 1000)).toBe(false);
		const dropped = advanceTally(tally, 5000);
		expect(tallyIdle(dropped, dropped.lastLand + SCORE_BUMP_MS - 1)).toBe(false);
		expect(tallyIdle(dropped, dropped.lastLand + SCORE_BUMP_MS)).toBe(true);
	});
});

describe("packing the total", () => {
	it("lays the shown score's digits centred on the geometry, as the dot alphabet has them", () => {
		const frame = pack(createTally(42), 0);
		expect(frame.shown).toBe(42);
		const total = totalOf(frame);
		expect(total).toHaveLength(layoutDotMatrix("42").dots.length);
		const xs = total.map((d) => d.x);
		const ys = total.map((d) => d.y);
		expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(GEOMETRY.cx);
		expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(GEOMETRY.cy);
		expect(total[0].radius).toBeCloseTo(SCORE_PITCH * 0.38);
	});

	it("bumps the total as a point lands, and harder as a catch's last does", () => {
		const tally = tallyWith(0, [[3]], 1000);
		const { start, tick } = tally.catches[0];
		const rest = totalOf(pack(tally, start))[0].radius;
		const point = totalOf(pack(tally, start + FLIGHT_MS + 40))[0].radius;
		const last = totalOf(pack(tally, start + 2 * tick + FLIGHT_MS + 40))[0].radius;
		expect(point).toBeGreaterThan(rest);
		expect(last).toBeGreaterThan(point);
	});

	it("keeps bumping after the catch is dropped, until the bump is over", () => {
		const tally = advanceTally(tallyWith(0, [[1]], 1000), 5000);
		const bumped = totalOf(pack(tally, tally.lastLand + 40))[0].radius;
		const rested = totalOf(pack(tally, tally.lastLand + SCORE_BUMP_MS))[0].radius;
		expect(bumped).toBeGreaterThan(rested);
	});
});

describe("the feed", () => {
	it("queues a catch's points as a ribbon beside the total, in the catch's colour", () => {
		const tally = tallyWith(0, [[7, COMBO_AMBER]], 1000);
		const dots = dotsOf(pack(tally, 1000 + 100));
		expect(dots).toHaveLength(7);
		expect(new Set(dots.map((d) => d.color))).toEqual(new Set([AMBER]));
		const totalRight = Math.max(...totalOf(pack(tally, 1100)).map((d) => d.x));
		expect(Math.min(...dots.map((d) => d.x))).toBeGreaterThan(totalRight);
		// FEED_ROWS rows, a column per FEED_ROWS points
		expect(new Set(dots.map((d) => d.y.toFixed(3))).size).toBe(FEED_ROWS);
		expect(new Set(dots.map((d) => d.x.toFixed(3))).size).toBe(Math.ceil(7 / FEED_ROWS));
		expect(dots[FEED_ROWS].x - dots[0].x).toBeCloseTo(FEED_PITCH);
	});

	it("pops each point in a little after the one before", () => {
		const tally = tallyWith(0, [[7]], 1000);
		expect(dotsOf(pack(tally, 1000))).toHaveLength(1);
		const early = dotsOf(pack(tally, 1000 + 30));
		expect(early.length).toBeGreaterThan(1);
		expect(early[0].radius).toBeGreaterThan(early[early.length - 1].radius);
	});

	it("shows nothing for a catch not yet stamped", () => {
		const tally = withCatch(createTally(0), newCatch(0, 5, PINK));
		expect(dotsOf(pack(tally, 1000))).toHaveLength(0);
	});

	it("crawls the ribbon toward the total as its points leave", () => {
		const tally = tallyWith(0, [[9]], 1000);
		const { start, tick } = tally.catches[0];
		const before = dotsOf(pack(tally, start - tick));
		const later = dotsOf(pack(tally, start + 2 * tick + 1));
		// Three points are in the air; the rest have moved in by a column
		expect(later).toHaveLength(9);
		expect(later[FEED_ROWS].x).toBeCloseTo(before[FEED_ROWS].x - FEED_PITCH, 0);
	});

	it("flies a point from the front of the ribbon to the total's last digit", () => {
		const tally = tallyWith(5, [[3]], 1000);
		const { start } = tally.catches[0];
		const total = totalOf(pack(tally, start + 1));
		const landX = Math.max(...total.map((d) => d.x)) - 2 * SCORE_PITCH;
		const leaving = dotsOf(pack(tally, start + 1))[0];
		const landing = dotsOf(pack(tally, start + FLIGHT_MS - 1))[0];
		expect(leaving.x).toBeGreaterThan(landing.x);
		expect(landing.x).toBeCloseTo(landX, 0);
		expect(landing.y).toBeCloseTo(GEOMETRY.cy, 0);
		expect(landing.radius).toBeLessThan(leaving.radius);
	});

	it("lines a later catch's points up behind the first's", () => {
		const tally = tallyWith(
			0,
			[
				[3, PINK],
				[3, COMBO_AMBER],
			],
			1000,
		);
		const dots = dotsOf(pack(tally, 1100));
		expect(dots.map((d) => d.color)).toEqual([0, 0, 0, AMBER, AMBER, AMBER]);
		expect(dots[3].x - dots[0].x).toBeCloseTo(FEED_PITCH);
	});
});

describe("the transfer", () => {
	const transfer = (tally: Tally, now: number) => dotsOf(pack(tally, now, "transfer"));

	it("writes the catch's value under the total, right-aligned to it, in its colour", () => {
		const tally = tallyWith(42, [[15, COMBO_AMBER]], 1000);
		const dots = transfer(tally, 1000 + 100);
		expect(dots).toHaveLength(layoutDotMatrix("15").dots.length);
		expect(new Set(dots.map((d) => d.color))).toEqual(new Set([AMBER]));
		const total = totalOf(pack(tally, 1100));
		const totalBottom = Math.max(...total.map((d) => d.y));
		const totalRight = Math.max(...total.map((d) => d.x));
		expect(Math.min(...dots.map((d) => d.y))).toBeGreaterThan(totalBottom);
		// The boxes share a right edge; the total's dots sit half a pitch in, the addend's too
		expect(Math.max(...dots.map((d) => d.x))).toBeCloseTo(
			totalRight + (SCORE_PITCH - ADDEND_PITCH) / 2,
			0,
		);
		expect(dots[0].radius).toBeCloseTo(ADDEND_PITCH * 0.38);
	});

	it("pops the addend in from a smaller size", () => {
		const tally = tallyWith(42, [[15]], 1000);
		const popping = transfer(tally, 1000);
		const settledIn = transfer(tally, 1000 + 130);
		expect(popping[0].radius).toBeLessThan(settledIn[0].radius);
	});

	it("counts the addend down as its points leave, while the total counts up as they land", () => {
		const tally = tallyWith(42, [[3]], 1000);
		const { start, tick } = tally.catches[0];
		const digits = (value: number) => layoutDotMatrix(String(value)).dots.length;
		// Just after the first point leaves: the addend reads 2, plus the point in the air
		const flying = transfer(tally, start + 1);
		expect(flying).toHaveLength(digits(2) + 1);
		expect(pack(tally, start + 1, "transfer").shown).toBe(42);
		expect(pack(tally, start + FLIGHT_MS, "transfer").shown).toBe(43);
		// After the last leaves and lands: nothing under the total, the total whole
		const done = pack(tally, start + 2 * tick + FLIGHT_MS, "transfer");
		expect(done.shown).toBe(45);
		expect(dotsOf(done)).toHaveLength(0);
	});

	it("stacks a combo's catches as lines, and closes them up over a spent one", () => {
		const tally = tallyWith(
			0,
			[
				[2, PINK],
				[6, COMBO_AMBER],
			],
			1000,
		);
		const [first, second] = tally.catches;
		// A line's bottom: its points fly up out of it
		const lineY = (now: number, color: number) =>
			Math.max(
				...transfer(tally, now)
					.filter((d) => d.color === color)
					.map((d) => d.y),
			);
		const pinkY = lineY(1100, 0);
		const amberY = lineY(1100, AMBER);
		expect(amberY).toBeGreaterThan(pinkY);
		// Once the first's last point has left, the second rises into its place
		const lastDepart = first.start + first.tick;
		expect(second.start).toBe(lastDepart + first.tick);
		expect(lineY(lastDepart + SHIFT_MS / 2, AMBER)).toBeLessThan(amberY);
		expect(lineY(lastDepart + SHIFT_MS, AMBER)).toBeCloseTo(pinkY, 0);
	});
});

describe("the total in a combo", () => {
	// A plain catch, then a combo's two: points land 1260; 1320, 1380, 1440; 1500 to 1740
	const combo = () =>
		tallyWith(
			10,
			[
				[1, PINK],
				[3, COMBO_AMBER],
				[5, COMBO_AMBER],
			],
			1000,
		);

	it("stays in the score colour while a catch outside a combo counts in", () => {
		expect(tallyInCombo(combo(), 1000)).toBe(false);
		expect(tallyInCombo(combo(), 1259)).toBe(false);
		expect(pack(combo(), 1259).combo).toBe(false);
	});

	it("turns amber as the combo's points count in, and stays amber across its catches", () => {
		for (const now of [1260, 1380, 1440, 1441, 1500, 1739]) {
			expect(tallyInCombo(combo(), now)).toBe(true);
		}
		expect(pack(combo(), 1400).combo).toBe(true);
		// Still amber once the catches before have been dropped
		expect(tallyInCombo(advanceTally(combo(), 1600), 1600)).toBe(true);
	});

	it("turns back as the combo's last point lands", () => {
		expect(tallyInCombo(combo(), 1740)).toBe(false);
		expect(tallyInCombo(advanceTally(combo(), 1900), 1900)).toBe(false);
	});

	it("turns back as a catch outside the combo starts to count in", () => {
		const tally = tallyWith(
			0,
			[
				[3, COMBO_AMBER],
				[2, PINK],
			],
			1000,
		);
		expect(tallyInCombo(tally, 1379)).toBe(true);
		expect(tallyInCombo(tally, 1380)).toBe(false);
	});

	it("waits for the combo's first point to leave before turning amber", () => {
		const tally = tallyWith(0, [[3, COMBO_AMBER]], 1000);
		expect(tallyInCombo(tally, 1000 + HOLD_MS - 1)).toBe(false);
		expect(tallyInCombo(tally, 1000 + HOLD_MS)).toBe(true);
	});
});

describe("packing the sprites", () => {
	it("draws the total in combo amber while the frame is in a combo", () => {
		const frame = pack(tallyWith(42, [[3, COMBO_AMBER]], 1000), 1200);
		const out = tallySprites(plainKit());
		const colors = BURST_COLORS.map((_, i) => Float32Array.of(i, i, i, 1));
		packTallySprites(frame, colors, Float32Array.of(9, 9, 9, 1), out);
		expect(out.dots.colors[out.dots.count][0]).toEqual(colors[AMBER]);
	});

	it("places a glow and a dot per dot, the total in the score colour, the rest tinted", () => {
		const tally = tallyWith(42, [[3, COMBO_AMBER]], 1000);
		// Before its first point leaves, so the total is not yet in the combo
		const frame = pack(tally, 1100);
		const out = tallySprites(plainKit());
		const colors = BURST_COLORS.map((_, i) => Float32Array.of(i, i, i, 1));
		const score = Float32Array.of(9, 9, 9, 1);
		packTallySprites(frame, colors, score, out);
		const totalCount = frame.total.length / 3;
		expect(out.glows.count).toBe(totalCount + 3);
		expect(out.dots.count).toBe(totalCount + 3);
		expect(out.dots.colors[out.dots.count][0]).toEqual(score);
		expect(out.dots.colors[out.dots.count][totalCount]).toEqual(
			Float32Array.of(AMBER, AMBER, AMBER, 1),
		);
		// Scaled about the dot's centre
		const placement = out.dots.placements[out.dots.count][0];
		expect(placement.tx + placement.scos * 10).toBeCloseTo(frame.total[0]);
	});
});
