import { BURST_COLORS, NOT_STARTED } from "../../presentation/effects/burstFrames";
import { SCORE_BUMP_MS } from "../../presentation/effects/scoreBump";
import {
	advanceTally,
	aimCatch,
	createTally,
	DRAIN_MS,
	FAR_FLIGHT_MS,
	newCatch,
	placeTotal,
	resetTally,
	SCORE_CENTRE_Y,
	SCORE_PITCH,
	shownScore,
	sliversInAir,
	type Tally,
	TICK_MAX_MS,
	TICK_MIN_MS,
	tallyIdle,
	tallyInCombo,
	tickFor,
	UNPLACED,
	withCatch,
	withGeometry,
} from "../../presentation/effects/scoreTally";
import { COMBO_AMBER, WHITE } from "../../presentation/theme/theme";

const PINK = BURST_COLORS[0];
const AMBER = BURST_COLORS.indexOf(COMBO_AMBER);
/** One px per ms, so a sliver's flight in ms is its way to the digits' edge in px */
const GEOMETRY = { cx: 200, cy: 40, speed: 1 };
/** Half the height of the total's digits */
const HALF_HEIGHT = (7 * SCORE_PITCH) / 2;

/** A catch straight below the total, `distance` px beyond its digits' bottom edge */
const catchBelow = (value: number, color: string, distance: number) =>
	newCatch(value, color, GEOMETRY.cx, GEOMETRY.cy + HALF_HEIGHT + distance);

/**
 * A tally of `score` with `catches` queued, each straight below the total at its distance
 * (100 px unless given), advanced to `now` so each is stamped
 */
function tallyWith(
	score: number,
	catches: [value: number, color?: string, distance?: number][],
	now: number,
): Tally {
	let tally = createTally(score, GEOMETRY);
	for (const [value, color, distance] of catches) {
		tally = withCatch(tally, catchBelow(value, color ?? PINK, distance ?? 100));
	}
	return advanceTally(tally, now);
}

/** A catch at (`x`, `y`) aimed at a total of `score` */
function aimed(x: number, y: number, score: number, geometry = GEOMETRY) {
	const c = newCatch(1, PINK, x, y);
	aimCatch(c, score, geometry);
	return c;
}

describe("a catch's tick", () => {
	it("spreads the drain over the catch's slivers, within the bounds", () => {
		expect(tickFor(1)).toBe(TICK_MAX_MS);
		expect(tickFor(10)).toBe(DRAIN_MS / 10);
		expect(tickFor(100)).toBe(TICK_MIN_MS);
	});
});

describe("aiming a catch", () => {
	it("stands the total at the stage's top centre", () => {
		expect(placeTotal(400, 800)).toMatchObject({ cx: 200, cy: SCORE_CENTRE_Y });
	});

	it("brings a sliver from the stage's far bottom corner to the total in about FAR_FLIGHT_MS", () => {
		const geometry = placeTotal(400, 800);
		expect(Math.hypot(200, 800 - SCORE_CENTRE_Y) / geometry.speed).toBeCloseTo(FAR_FLIGHT_MS);
		// Its flight ends at the digits' edge, a little short of the centre
		const { flight } = aimed(0, 800, 0, geometry);
		expect(flight).toBeLessThan(FAR_FLIGHT_MS);
		expect(flight).toBeGreaterThan(FAR_FLIGHT_MS * 0.9);
	});

	it("flies at one steady speed, so twice as far takes twice as long", () => {
		const below = GEOMETRY.cy + HALF_HEIGHT;
		expect(aimed(GEOMETRY.cx, below + 100, 0).flight).toBeCloseTo(100);
		expect(aimed(GEOMETRY.cx, below + 200, 0).flight).toBeCloseTo(200);
	});

	it("ends at the edge of the digits, on the line to their centre", () => {
		const c = aimed(GEOMETRY.cx + 150, GEOMETRY.cy, 7);
		expect(c.toX).toBeCloseTo(GEOMETRY.cx + (5 * SCORE_PITCH) / 2);
		expect(c.toY).toBeCloseTo(GEOMETRY.cy);
		const slant = aimed(100, 300, 0);
		const across =
			(slant.toX - 100) * (GEOMETRY.cy - 300) - (slant.toY - 300) * (GEOMETRY.cx - 100);
		expect(across).toBeCloseTo(0);
		expect(Math.hypot(slant.toX - 100, slant.toY - 300)).toBeCloseTo(slant.flight);
	});

	it("ends sooner at wider digits", () => {
		const x = GEOMETRY.cx + 150;
		expect(aimed(x, GEOMETRY.cy, 777).flight).toBeCloseTo(150 - (17 * SCORE_PITCH) / 2);
	});

	it("takes no time from inside the digits", () => {
		expect(aimed(GEOMETRY.cx, GEOMETRY.cy, 5).flight).toBe(0);
		expect(aimed(GEOMETRY.cx + 1, GEOMETRY.cy + 2, 5).flight).toBe(0);
	});
});

describe("queuing", () => {
	it("takes a catch's colour from the burst colours, white for any other", () => {
		expect(catchBelow(5, COMBO_AMBER, 10).color).toBe(AMBER);
		expect(catchBelow(5, "#123456", 10).color).toBe(BURST_COLORS.indexOf(WHITE));
	});

	it("queues a copy the UI thread may stamp, leaving the queued catch unstamped", () => {
		const c = catchBelow(5, PINK, 10);
		const tally = withCatch(createTally(0, GEOMETRY), c);
		expect(tally.catches[0]).toEqual(c);
		expect(tally.catches[0]).not.toBe(c);
		expect(c.at).toBe(NOT_STARTED);
	});

	it("queues every catch, however many are on their way", () => {
		let tally = createTally(10, GEOMETRY);
		for (let i = 0; i < 20; i++) tally = withCatch(tally, catchBelow(1, PINK, 10));
		expect(tally.catches).toHaveLength(20);
	});

	it("starts over at a new run's score, standing where it stood", () => {
		const tally = resetTally(tallyWith(10, [[5]], 1000), 0);
		expect(tally).toEqual(createTally(0, GEOMETRY));
	});
});

describe("advancing the tally", () => {
	it("sends a catch's first sliver the moment it is first drawn, aimed at the total", () => {
		const [c] = tallyWith(0, [[5]], 1000).catches;
		expect(c.at).toBe(1000);
		expect(c.flight).toBeCloseTo(100);
		expect(c.toY).toBeCloseTo(GEOMETRY.cy + HALF_HEIGHT);
	});

	it("aims a catch at the total as it then stands, wherever the stage last placed it", () => {
		const moved = { ...GEOMETRY, cy: GEOMETRY.cy - 50 };
		let tally = withGeometry(createTally(0, GEOMETRY), moved);
		tally = advanceTally(withCatch(tally, catchBelow(1, PINK, 100)), 1000);
		expect(tally.catches[0].flight).toBeCloseTo(150);
	});

	it("sends the slivers of catches side by side, none waiting on another", () => {
		const tally = tallyWith(0, [[9], [3]], 1000);
		expect(tally.catches.map((c) => c.at)).toEqual([1000, 1000]);
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
		const tally = withCatch(createTally(7, GEOMETRY), catchBelow(5, PINK, 10));
		expect(shownScore(tally, 99999)).toBe(7);
	});

	it("knows a sliver is on its way until the last has landed", () => {
		expect(sliversInAir(createTally(3, UNPLACED))).toBe(false);
		const tally = tallyWith(0, [[2]], 1000);
		expect(sliversInAir(tally)).toBe(true);
		expect(sliversInAir(advanceTally(tally, 5000))).toBe(false);
	});

	it("counts a catch at once before the stage has placed the total", () => {
		const tally = advanceTally(withCatch(createTally(0, UNPLACED), catchBelow(1, PINK, 300)), 1000);
		expect(shownScore(tally, 1000)).toBe(1);
	});
});

describe("idling", () => {
	it("is idle with nothing queued and the last bump over", () => {
		expect(tallyIdle(createTally(0, UNPLACED), 0)).toBe(true);
		const tally = tallyWith(0, [[1]], 1000);
		expect(tallyIdle(tally, 1000)).toBe(false);
		const dropped = advanceTally(tally, 5000);
		expect(tallyIdle(dropped, dropped.lastLand + SCORE_BUMP_MS - 1)).toBe(false);
		expect(tallyIdle(dropped, dropped.lastLand + SCORE_BUMP_MS)).toBe(true);
	});
});

describe("the total in a combo", () => {
	it("stays in the score colour while only a catch outside a combo counts in", () => {
		expect(tallyInCombo(tallyWith(0, [[2, PINK]], 1000), 1100)).toBe(false);
	});

	it("turns amber as the combo's first sliver arrives, not as it leaves", () => {
		const tally = tallyWith(0, [[3, COMBO_AMBER]], 1000);
		expect(tallyInCombo(tally, 1099)).toBe(false);
		expect(tallyInCombo(tally, 1100)).toBe(true);
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
