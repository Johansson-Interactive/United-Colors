import { GLOW_SCALE, layoutDotMatrix } from "../../presentation/dotmatrix/layout";
import { plainKit } from "../../presentation/dotSprites";
import { BURST_COLORS, NOT_STARTED } from "../../presentation/effects/burstFrames";
import { SCORE_BUMP_MS } from "../../presentation/effects/scoreBump";
import {
	advanceTally,
	createTally,
	DOT_STRIDE,
	DRAIN_MS,
	FAR_FLIGHT_MS,
	flightFor,
	freezeTally,
	newCatch,
	packTally,
	packTallySprites,
	resetTally,
	SCORE_CENTRE_Y,
	SCORE_PITCH,
	SCORE_TOP,
	SLIVER_RADIUS,
	shownScore,
	sliverSpeed,
	sliversInAir,
	type Tally,
	type TallyCatch,
	type TallyFrame,
	TICK_MAX_MS,
	TICK_MIN_MS,
	tallyFrame,
	tallyIdle,
	tallyInCombo,
	tallySprites,
	tickFor,
	withItem,
} from "../../presentation/effects/scoreTally";
import { COMBO_AMBER, WHITE } from "../../presentation/theme/theme";

const PINK = BURST_COLORS[0];
const AMBER = BURST_COLORS.indexOf(COMBO_AMBER);
/** One px per ms, so a sliver's flight in ms is its way to the digits' edge in px */
const GEOMETRY = { cx: 200, cy: 40, speed: 1 };
/** Half the height of the total's digits */
const HALF_HEIGHT = (7 * SCORE_PITCH) / 2;

/** A catch straight below the total, `distance` px beyond its digits' bottom edge */
function catchBelow(id: number, value: number, color: string, distance: number) {
	const y = GEOMETRY.cy + HALF_HEIGHT + distance;
	return newCatch(id, value, color, GEOMETRY.cx, y, 0, GEOMETRY);
}

/**
 * A tally of `score` with `catches` queued, each straight below the total at its distance
 * (100 px unless given), advanced to `now` so each is stamped
 */
function tallyWith(
	score: number,
	catches: [value: number, color?: string, distance?: number][],
	now: number,
): Tally {
	let tally = createTally(score);
	catches.forEach(([value, color, distance], i) => {
		tally = withItem(tally, catchBelow(i, value, color ?? PINK, distance ?? 100));
	});
	return advanceTally(tally, now);
}

function pack(tally: Tally, now: number): TallyFrame {
	const out = tallyFrame();
	packTally(tally, now, GEOMETRY, out);
	return out;
}

/** The packed slivers as objects */
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

/** The catch inside a queued item */
function catchOf(item: ReturnType<typeof newCatch>): TallyCatch {
	if (item.kind !== "catch") throw new Error("not a catch");
	return item.catch;
}

describe("a catch's tick", () => {
	it("spreads the drain over the catch's slivers, within the bounds", () => {
		expect(tickFor(1)).toBe(TICK_MAX_MS);
		expect(tickFor(10)).toBe(DRAIN_MS / 10);
		expect(tickFor(100)).toBe(TICK_MIN_MS);
	});
});

describe("a sliver's flight", () => {
	it("brings a sliver from the stage's far bottom corner to the total in FAR_FLIGHT_MS", () => {
		const speed = sliverSpeed(400, 800, SCORE_CENTRE_Y);
		const geometry = { cx: 200, cy: SCORE_CENTRE_Y, speed };
		const far = Math.hypot(200, 800 - SCORE_CENTRE_Y) / speed;
		expect(far).toBeCloseTo(FAR_FLIGHT_MS);
		// Its flight ends at the digits' edge, a little short of the centre
		const flight = flightFor(0, 800, 0, geometry);
		expect(flight).toBeLessThan(FAR_FLIGHT_MS);
		expect(flight).toBeGreaterThan(FAR_FLIGHT_MS * 0.9);
	});

	it("flies at one steady speed, so twice as far takes twice as long", () => {
		const near = catchOf(catchBelow(0, 1, PINK, 100)).flight;
		const far = catchOf(catchBelow(0, 1, PINK, 200)).flight;
		expect(near).toBeCloseTo(100);
		expect(far).toBeCloseTo(2 * near);
	});

	it("ends at the side of the digits for a catch level with the total, wider digits sooner", () => {
		const x = GEOMETRY.cx + 150;
		const one = flightFor(x, GEOMETRY.cy, 7, GEOMETRY);
		const three = flightFor(x, GEOMETRY.cy, 777, GEOMETRY);
		expect(one).toBeCloseTo(150 - (5 * SCORE_PITCH) / 2);
		expect(three).toBeCloseTo(150 - (17 * SCORE_PITCH) / 2);
	});

	it("takes no time from inside the digits", () => {
		expect(flightFor(GEOMETRY.cx, GEOMETRY.cy, 5, GEOMETRY)).toBe(0);
		expect(flightFor(GEOMETRY.cx + 1, GEOMETRY.cy + 2, 5, GEOMETRY)).toBe(0);
	});
});

describe("queuing", () => {
	it("takes a catch's colour from the burst colours, white for any other", () => {
		expect(catchOf(catchBelow(0, 5, COMBO_AMBER, 10)).color).toBe(AMBER);
		expect(catchOf(catchBelow(0, 5, "#123456", 10)).color).toBe(BURST_COLORS.indexOf(WHITE));
	});

	it("queues a copy the UI thread may stamp, leaving the queued catch unstamped", () => {
		const item = catchBelow(0, 5, PINK, 10);
		const tally = withItem(createTally(0), item);
		expect(tally.catches[0]).toEqual(catchOf(item));
		expect(tally.catches[0]).not.toBe(catchOf(item));
		expect(catchOf(item).at).toBe(NOT_STARTED);
	});

	it("queues every catch, however many are on their way", () => {
		let tally = createTally(10);
		for (let i = 0; i < 20; i++) tally = withItem(tally, catchBelow(i, 1, PINK, 10));
		expect(tally.catches).toHaveLength(20);
		expect(tally.settled).toBe(10);
	});

	it("starts over at a new run's score, dropping everything on its way", () => {
		const tally = withItem(tallyWith(10, [[5]], 1000), resetTally(0));
		expect(tally.catches).toEqual([]);
		expect(shownScore(tally, 2000)).toBe(0);
		expect(sliversInAir(tally)).toBe(false);
	});
});

describe("advancing the tally", () => {
	it("sends a catch's first sliver the moment it is first drawn", () => {
		const tally = tallyWith(0, [[5]], 1000);
		expect(tally.catches[0].at).toBe(1000);
	});

	it("sends the slivers of catches side by side, none waiting on another", () => {
		const tally = tallyWith(0, [[9], [3]], 1000);
		expect(tally.catches.map((c) => c.at)).toEqual([1000, 1000]);
		expect(dotsOf(pack(tally, 1001))).toHaveLength(2);
	});

	it("returns the same tally while nothing is over", () => {
		const tally = tallyWith(0, [[5]], 1000);
		expect(advanceTally(tally, 1001)).toBe(tally);
	});

	it("drops a catch once its last sliver has landed", () => {
		const tally = tallyWith(10, [[5]], 1000);
		const { tick } = tally.catches[0];
		const over = 1000 + 4 * tick + 100;
		expect(advanceTally(tally, over - 1).catches).toHaveLength(1);
		const dropped = advanceTally(tally, over);
		expect(dropped.catches).toHaveLength(0);
		expect(dropped.settled).toBe(15);
		expect(dropped.lastLand).toBe(over);
	});
});

describe("the score shown", () => {
	it("counts a sliver in as it reaches the total, and the whole catch once its last has", () => {
		const tally = tallyWith(10, [[5]], 1000);
		const { tick } = tally.catches[0];
		expect(shownScore(tally, 1099)).toBe(10);
		expect(shownScore(tally, 1100)).toBe(11);
		expect(shownScore(tally, 1100 + 2 * tick)).toBe(13);
		expect(shownScore(tally, 1100 + 4 * tick)).toBe(15);
		expect(shownScore(tally, 9999)).toBe(15);
	});

	it("counts a near catch in before an earlier, far one", () => {
		const tally = tallyWith(
			0,
			[
				[1, PINK, 400],
				[1, PINK, 50],
			],
			1000,
		);
		expect(shownScore(tally, 1050)).toBe(1);
		expect(shownScore(tally, 1399)).toBe(1);
		expect(shownScore(tally, 1400)).toBe(2);
	});

	it("is the score alone before a catch is stamped", () => {
		const tally = withItem(createTally(7), catchBelow(0, 5, PINK, 10));
		expect(shownScore(tally, 99999)).toBe(7);
	});

	it("knows a sliver is on its way until the last has landed", () => {
		expect(sliversInAir(createTally(3))).toBe(false);
		const tally = tallyWith(0, [[2]], 1000);
		expect(sliversInAir(tally)).toBe(true);
		expect(sliversInAir(advanceTally(tally, 5000))).toBe(false);
	});
});

describe("freezing with the run", () => {
	/** A catch of 3 sent at 1000, frozen at 1050 and thawed at 5050 */
	const frozen = () => advanceTally(withItem(tallyWith(0, [[3]], 1000), freezeTally(true)), 1050);
	const thawed = () => advanceTally(withItem(frozen(), freezeTally(false)), 5050);

	it("stands the slivers still in the air while frozen", () => {
		const tally = frozen();
		expect(dotsOf(pack(tally, 3000))).toEqual(dotsOf(pack(tally, 1050)));
		expect(shownScore(tally, 3000)).toBe(0);
		expect(advanceTally(tally, 3000).catches).toHaveLength(1);
	});

	it("flies them on from where they stood once thawed", () => {
		const tally = thawed();
		expect(dotsOf(pack(tally, 5050))).toEqual(dotsOf(pack(frozen(), 1050)));
		// The first sliver had 50 ms left to fly
		expect(shownScore(tally, 5099)).toBe(0);
		expect(shownScore(tally, 5100)).toBe(1);
	});

	it("idles while frozen, but not while a freeze or a thaw waits for the next frame", () => {
		const asked = withItem(tallyWith(0, [[3]], 1000), freezeTally(true));
		expect(tallyIdle(asked, 1050)).toBe(false);
		expect(tallyIdle(frozen(), 1050)).toBe(true);
		expect(tallyIdle(withItem(frozen(), freezeTally(false)), 2000)).toBe(false);
	});

	it("keeps a freeze through a reset", () => {
		const tally = withItem(frozen(), resetTally(0));
		expect(tally.freeze).toBe(true);
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

	it("bumps the total as a sliver lands, and harder as a catch's last does", () => {
		const tally = tallyWith(0, [[3]], 1000);
		const { tick } = tally.catches[0];
		const rest = totalOf(pack(tally, 1000))[0].radius;
		const point = totalOf(pack(tally, 1100 + 40))[0].radius;
		const last = totalOf(pack(tally, 1100 + 2 * tick + 40))[0].radius;
		expect(point).toBeGreaterThan(rest);
		expect(last).toBeGreaterThan(point);
	});

	it("keeps bumping after the catch is dropped, until the bump is over", () => {
		const tally = advanceTally(tallyWith(0, [[1]], 1000), 5000);
		const bumped = totalOf(pack(tally, tally.lastLand + 40))[0].radius;
		const rested = totalOf(pack(tally, tally.lastLand + SCORE_BUMP_MS))[0].radius;
		expect(bumped).toBeGreaterThan(rested);
	});

	it("keeps the total's glow on the stage at the peak of its hard bump", () => {
		const geometry = { ...GEOMETRY, cy: SCORE_CENTRE_Y };
		const tally = advanceTally(tallyWith(0, [[1]], 1000), 5000);
		const out = tallyFrame();
		packTally(tally, tally.lastLand + 70, geometry, out);
		const total = totalOf(out);
		expect(Math.min(...total.map((d) => d.y - d.radius * GLOW_SCALE))).toBeGreaterThanOrEqual(
			SCORE_TOP,
		);
	});
});

describe("the slivers", () => {
	it("leave from where the catch happened, one after another, in the catch's colour", () => {
		const tally = withItem(createTally(0), newCatch(0, 5, COMBO_AMBER, 50, 300, 0, GEOMETRY));
		const sent = advanceTally(tally, 1000);
		const { tick } = sent.catches[0];
		const first = dotsOf(pack(sent, 1000));
		expect(first).toHaveLength(1);
		expect(first[0]).toMatchObject({
			x: 50,
			y: 300,
			radius: SLIVER_RADIUS,
			color: AMBER,
			alpha: 1,
		});
		expect(dotsOf(pack(sent, 1000 + 2 * tick))).toHaveLength(3);
	});

	it("fly straight at the total's middle at the steady speed", () => {
		const sent = advanceTally(
			withItem(createTally(0), newCatch(0, 1, PINK, 50, 300, 0, GEOMETRY)),
			1000,
		);
		const [dot] = dotsOf(pack(sent, 1100));
		expect(Math.hypot(dot.x - 50, dot.y - 300)).toBeCloseTo(100);
		// On the line to the centre
		const across = (dot.x - 50) * (GEOMETRY.cy - 300) - (dot.y - 300) * (GEOMETRY.cx - 50);
		expect(across).toBeCloseTo(0);
	});

	it("shrink a little on the way, and vanish as they reach the digits' edge", () => {
		const tally = tallyWith(0, [[1]], 1000);
		const [late] = dotsOf(pack(tally, 1099));
		expect(late.radius).toBeLessThan(SLIVER_RADIUS);
		expect(late.y).toBeCloseTo(GEOMETRY.cy + HALF_HEIGHT + 1);
		expect(dotsOf(pack(tally, 1100))).toHaveLength(0);
	});

	it("show nothing for a catch not yet stamped", () => {
		const tally = withItem(createTally(0), catchBelow(0, 5, PINK, 10));
		expect(dotsOf(pack(tally, 1000))).toHaveLength(0);
	});
});

describe("the total in a combo", () => {
	it("stays in the score colour while only a catch outside a combo counts in", () => {
		const tally = tallyWith(0, [[2, PINK]], 1000);
		expect(tallyInCombo(tally, 1100)).toBe(false);
	});

	it("turns amber as the combo's first sliver arrives, not as it leaves", () => {
		const tally = tallyWith(0, [[3, COMBO_AMBER]], 1000);
		expect(tallyInCombo(tally, 1099)).toBe(false);
		expect(tallyInCombo(tally, 1100)).toBe(true);
		expect(pack(tally, 1100).combo).toBe(true);
	});

	it("stays amber across slivers outside the combo landing in between", () => {
		const tally = tallyWith(
			0,
			[
				[3, COMBO_AMBER, 50],
				[3, PINK, 60],
			],
			1000,
		);
		for (const now of [1050, 1060, 1120, 1169]) expect(tallyInCombo(tally, now)).toBe(true);
	});

	it("stays amber while another amber catch is on its way after one is dropped", () => {
		const tally = tallyWith(
			0,
			[
				[1, COMBO_AMBER, 50],
				[1, COMBO_AMBER, 300],
			],
			1000,
		);
		const dropped = advanceTally(tally, 1100);
		expect(dropped.catches).toHaveLength(1);
		expect(tallyInCombo(dropped, 1100)).toBe(true);
		expect(tallyInCombo(dropped, 1299)).toBe(true);
	});

	it("turns back as the last amber sliver arrives", () => {
		const tally = tallyWith(0, [[3, COMBO_AMBER]], 1000);
		const { tick } = tally.catches[0];
		const end = 1100 + 2 * tick;
		expect(tallyInCombo(tally, end - 1)).toBe(true);
		expect(tallyInCombo(tally, end)).toBe(false);
		expect(tallyInCombo(advanceTally(tally, end), end)).toBe(false);
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
		// Before its first sliver arrives, so the total is not yet in the combo; two in the air
		const frame = pack(tally, 1070);
		const out = tallySprites(plainKit());
		const colors = BURST_COLORS.map((_, i) => Float32Array.of(i, i, i, 1));
		const score = Float32Array.of(9, 9, 9, 1);
		packTallySprites(frame, colors, score, out);
		const totalCount = frame.total.length / 3;
		expect(out.glows.count).toBe(totalCount + 2);
		expect(out.dots.count).toBe(totalCount + 2);
		expect(out.dots.colors[out.dots.count][0]).toEqual(score);
		expect(out.dots.colors[out.dots.count][totalCount]).toEqual(
			Float32Array.of(AMBER, AMBER, AMBER, 1),
		);
		// Scaled about the dot's centre
		const placement = out.dots.placements[out.dots.count][0];
		expect(placement.tx + placement.scos * 10).toBeCloseTo(frame.total[0]);
	});
});
