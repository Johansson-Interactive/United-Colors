import { GLOW_SCALE, layoutDotMatrix } from "../../presentation/dotmatrix/layout";
import { plainKit } from "../../presentation/dotSprites";
import { BURST_COLORS } from "../../presentation/effects/burstFrames";
import { SCORE_BUMP_MS } from "../../presentation/effects/scoreBump";
import {
	advanceTally,
	createTally,
	newCatch,
	SCORE_CENTRE_Y,
	SCORE_PITCH,
	SCORE_TOP,
	type Tally,
	type TallyGeometry,
	withCatch,
} from "../../presentation/effects/scoreTally";
import {
	DOT_STRIDE,
	packTally,
	packTallySprites,
	SLIVER_RADIUS,
	type TallyFrame,
	tallyFrame,
	tallySprites,
} from "../../presentation/effects/tallyPack";
import { COMBO_AMBER } from "../../presentation/theme/theme";

const PINK = BURST_COLORS[0];
const AMBER = BURST_COLORS.indexOf(COMBO_AMBER);
/** One px per ms, so a sliver's flight in ms is its way to the digits' edge in px */
const GEOMETRY: TallyGeometry = { cx: 200, cy: 40, speed: 1 };
const HALF_HEIGHT = (7 * SCORE_PITCH) / 2;

/** A tally of `score` with a catch of `value` in `color` at (`x`, `y`), stamped at 1000 */
function sent(score: number, value: number, color: string, x: number, y: number): Tally {
	const tally = withCatch(createTally(score, GEOMETRY), newCatch(value, color, x, y));
	return advanceTally(tally, 1000);
}

/** The same, straight below the total, 100 px beyond its digits */
const sentBelow = (score: number, value: number, color = PINK) =>
	sent(score, value, color, GEOMETRY.cx, GEOMETRY.cy + HALF_HEIGHT + 100);

function pack(tally: Tally, now: number): TallyFrame {
	const out = tallyFrame();
	packTally(tally, now, out);
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

describe("packing the total", () => {
	it("lays the shown score's digits centred where the tally stands", () => {
		const frame = pack(createTally(42, GEOMETRY), 0);
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
		const tally = sentBelow(0, 3);
		const { tick } = tally.catches[0];
		const rest = totalOf(pack(tally, 1000))[0].radius;
		const point = totalOf(pack(tally, 1100 + 40))[0].radius;
		const last = totalOf(pack(tally, 1100 + 2 * tick + 40))[0].radius;
		expect(point).toBeGreaterThan(rest);
		expect(last).toBeGreaterThan(point);
	});

	it("keeps bumping after the catch is dropped, until the bump is over", () => {
		const tally = advanceTally(sentBelow(0, 1), 5000);
		const bumped = totalOf(pack(tally, tally.lastLand + 40))[0].radius;
		const rested = totalOf(pack(tally, tally.lastLand + SCORE_BUMP_MS))[0].radius;
		expect(bumped).toBeGreaterThan(rested);
	});

	it("keeps the total's glow on the stage at the peak of its hard bump", () => {
		const at = { ...GEOMETRY, cy: SCORE_CENTRE_Y };
		let tally = withCatch(createTally(0, at), newCatch(1, PINK, at.cx, 400));
		tally = advanceTally(advanceTally(tally, 1000), 5000);
		const total = totalOf(pack(tally, tally.lastLand + 70));
		expect(Math.min(...total.map((d) => d.y - d.radius * GLOW_SCALE))).toBeGreaterThanOrEqual(
			SCORE_TOP,
		);
	});

	it("draws the total in combo amber while the tally is in a combo", () => {
		expect(pack(sentBelow(0, 3, COMBO_AMBER), 1100).combo).toBe(true);
		expect(pack(sentBelow(0, 3, COMBO_AMBER), 1099).combo).toBe(false);
	});
});

describe("packing the slivers", () => {
	it("send them from where the catch happened, one after another, in the catch's colour", () => {
		const tally = sent(0, 5, COMBO_AMBER, 50, 300);
		const { tick } = tally.catches[0];
		const first = dotsOf(pack(tally, 1000));
		expect(first).toEqual([{ x: 50, y: 300, radius: SLIVER_RADIUS, color: AMBER, alpha: 1 }]);
		expect(dotsOf(pack(tally, 1000 + 2 * tick))).toHaveLength(3);
	});

	it("fly them straight at the total at the steady speed", () => {
		const [dot] = dotsOf(pack(sent(0, 1, PINK, 50, 300), 1100));
		expect(Math.hypot(dot.x - 50, dot.y - 300)).toBeCloseTo(100);
		const across = (dot.x - 50) * (GEOMETRY.cy - 300) - (dot.y - 300) * (GEOMETRY.cx - 50);
		expect(across).toBeCloseTo(0);
	});

	it("shrink them a little on the way, and drop them as they reach the digits' edge", () => {
		const tally = sentBelow(0, 1);
		const [late] = dotsOf(pack(tally, 1099));
		expect(late.radius).toBeLessThan(SLIVER_RADIUS);
		expect(late.y).toBeCloseTo(GEOMETRY.cy + HALF_HEIGHT + 1);
		expect(dotsOf(pack(tally, 1100))).toEqual([]);
	});

	it("show nothing for a catch not yet stamped, or one from inside the digits", () => {
		const queued = withCatch(createTally(0, GEOMETRY), newCatch(5, PINK, 50, 300));
		expect(dotsOf(pack(queued, 1000))).toEqual([]);
		expect(dotsOf(pack(sent(0, 3, PINK, GEOMETRY.cx, GEOMETRY.cy), 1000))).toEqual([]);
	});
});

describe("packing the sprites", () => {
	const colors = BURST_COLORS.map((_, i) => Float32Array.of(i, i, i, 1));
	const score = Float32Array.of(9, 9, 9, 1);

	it("draws the total in combo amber while the frame is in a combo", () => {
		const frame = pack(sentBelow(42, 3, COMBO_AMBER), 1200);
		const out = tallySprites(plainKit());
		packTallySprites(frame, colors, score, out);
		expect(out.dots.colors[out.dots.count][0]).toEqual(colors[AMBER]);
	});

	it("places a glow and a dot per dot, the total in the score colour, the slivers tinted", () => {
		// Before the first sliver arrives, so the total is not yet in the combo; two in the air
		const frame = pack(sentBelow(42, 3, COMBO_AMBER), 1070);
		const out = tallySprites(plainKit());
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
