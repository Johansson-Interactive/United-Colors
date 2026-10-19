import { MERGE_MAX_DOTS } from "../../application/renderScene";
import type { RunCatch, RunRecord } from "../../domain/types";
import { GLYPH_ROWS } from "../../presentation/dotmatrix/glyphs";
import { layoutDotMatrix } from "../../presentation/dotmatrix/layout";
import { burstColor, layOutBurst, type NewBurst } from "../../presentation/effects/burstFrames";
import {
	POUR_FALL_MS,
	POUR_MAX_RADIUS,
	POUR_SETTLE_MS,
	POUR_SOUND_WINDOW_MS,
	POUR_SPAN_MS,
	POUR_STAGGER_MS,
	POUR_START_MS,
	type PourPlan,
	type PourView,
	planPour,
	pourAt,
} from "../../presentation/effects/pourRun";
import { COMBO_AMBER } from "../../presentation/theme/theme";

const RED = "#E53935";
const BLUE = "#1E88E5";
const GREEN = "#43A047";
const PITCH = 10;
const FRAME_MS = 1000 / 60;

/** A catch on `tick`: a small dot on its own unless told otherwise */
function caught(tick: number, more: Partial<RunCatch> = {}): RunCatch {
	return { tick, value: 1, step: 1, color: RED, point: false, ...more };
}

function plan(record: RunRecord, color = RED): PourPlan {
	return planPour({ record, color, pitch: PITCH });
}

/** A score pop of `text`, to lay out */
const popOf = (text: string): NewBurst => ({ kind: "pop", x: 0, y: 0, text, color: RED });

/** Run time in ticks at 30 Hz */
const seconds = (s: number) => s * 30;

/** When each catch lands, sampled every millisecond through the landings the stepper reports */
function landings(p: PourPlan, untilMs = 6000) {
	const found: ({ ms: number } & PourView["landings"][number])[] = [];
	for (let ms = 1; ms <= untilMs; ms++) {
		for (const landing of pourAt(p, ms, ms - 1).landings) found.push({ ms, ...landing });
	}
	return found;
}

/** When each sound is cued, sampled every millisecond through the sounds the stepper reports */
function sounds(p: PourPlan, untilMs = 6000) {
	const found: ({ ms: number } & PourView["sounds"][number])[] = [];
	for (let ms = 1; ms <= untilMs; ms++) {
		for (const sound of pourAt(p, ms, ms - 1).sounds) found.push({ ms, ...sound });
	}
	return found;
}

/**
 * When each body falling into the drop starts its fall, sampled every millisecond, checking on
 * the way that every fall takes POUR_FALL_MS and ends on a catch's landing (`landed`, in ms)
 */
function fallStarts(p: PourPlan, landed: readonly number[]): number[] {
	const starts = new Set<number>();
	for (let ms = 0; ms <= 6000; ms++) {
		for (const f of pourAt(p, ms).flights) {
			if (f.merge > 0 || f.fall >= 1) continue;
			const start = ms - f.fall * POUR_FALL_MS;
			const lands = start + POUR_FALL_MS;
			expect(landed.some((l) => l >= lands - 1e-6 && l < lands + 1)).toBe(true);
			starts.add(Math.round(start * 1000) / 1000);
		}
	}
	return [...starts].sort((a, b) => a - b);
}

describe("pourAt", () => {
	it("pours a 20 s run and a 5 min run in the same fixed span", () => {
		const short = plan({ catches: [caught(30), caught(200), caught(560)], ticks: seconds(20) });
		const long = plan({
			catches: [caught(30), caught(2000), caught(8800)],
			ticks: seconds(300),
		});
		for (const p of [short, long]) {
			const times = landings(p).map((l) => l.ms);
			expect(times).toEqual([POUR_START_MS, expect.any(Number), POUR_START_MS + POUR_SPAN_MS]);
		}
	});

	it("lands every catch in order at its real time in the run, mapped onto the span", () => {
		// Slow stretches, then a flurry of thirty, two to a tick, then slow again
		const flurry = Array.from({ length: 30 }, (_, i) =>
			caught(400 + Math.floor(i / 2), { step: i + 1, value: 2 * i + 1 }),
		);
		const ticks = [10, 110, 210, 310, ...flurry.map((c) => c.tick), 510, 610, 1010];
		const p = plan({
			catches: [
				caught(10),
				caught(110),
				caught(210),
				caught(310),
				...flurry,
				...[510, 610, 1010].map((t) => caught(t)),
			],
			ticks: 1100,
		});
		const found = landings(p);
		expect(found.map((l) => l.pitch)).toEqual([
			0,
			0,
			0,
			0,
			...flurry.map((c) => Math.min(12, c.step - 1)),
			0,
			0,
			0,
		]);
		found.forEach(({ ms }, i) => {
			const real = POUR_START_MS + (POUR_SPAN_MS * (ticks[i] - 10)) / 1000;
			expect(ms).toBeGreaterThanOrEqual(real);
			expect(ms).toBeLessThan(real + 1);
		});
	});

	it("falls a flurry's catches as a few bodies, at least the stagger apart, at full speed", () => {
		const flurry = Array.from({ length: 30 }, (_, i) => caught(400 + Math.floor(i / 2)));
		const p = plan({ catches: [caught(10), ...flurry, caught(1010)], ticks: 1100 });
		const found = landings(p).map((l) => l.ms);
		const starts = fallStarts(p, found);
		expect(starts.length).toBeGreaterThan(1);
		expect(starts.length).toBeLessThan(found.length);
		for (let i = 1; i < starts.length; i++) {
			expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(POUR_STAGGER_MS - 1);
		}
		expect(POUR_STAGGER_MS).toBeGreaterThanOrEqual(2 * FRAME_MS);
		expect(POUR_STAGGER_MS).toBeLessThanOrEqual(8 * FRAME_MS);
	});

	it("keeps a long run's rhythm, its falls and the body limit, in the same span", () => {
		// Five minutes of catches, mostly a second or more apart, with a flurry now and then
		let seed = 7;
		const random = () => {
			seed = (seed * 9301 + 49297) % 233280;
			return seed / 233280;
		};
		const catches: RunCatch[] = [];
		for (let tick = 5; catches.length < 600; ) {
			catches.push(caught(tick));
			tick += random() < 0.3 ? Math.floor(random() * 2) : 5 + Math.floor(random() * 40);
		}
		const first = catches[0].tick;
		const runSpan = catches[catches.length - 1].tick - first;
		const p = plan({ catches, ticks: catches[catches.length - 1].tick + 30 });
		const found = landings(p);
		expect(found).toHaveLength(600);
		found.forEach(({ ms }, i) => {
			const real = POUR_START_MS + (POUR_SPAN_MS * (catches[i].tick - first)) / runSpan;
			expect(ms).toBeGreaterThanOrEqual(real);
			expect(ms).toBeLessThan(real + 1);
		});
		let most = 0;
		for (let ms = 0; ms <= 4000; ms++) most = Math.max(most, pourAt(p, ms).flights.length);
		expect(most).toBeLessThanOrEqual(MERGE_MAX_DOTS);
		expect(
			fallStarts(
				p,
				found.map((l) => l.ms),
			).length,
		).toBeGreaterThan(MERGE_MAX_DOTS);
	});

	it("never has more catches in flight than the merge shader draws, however dense the run", () => {
		for (const count of [12, 40, 400]) {
			const flurry = Array.from({ length: count }, (_, i) => caught(100 + Math.floor(i / 3)));
			const p = plan({ catches: flurry, ticks: seconds(60) });
			let most = 0;
			for (let ms = 0; ms <= 6000; ms += 2) most = Math.max(most, pourAt(p, ms).flights.length);
			expect(most).toBeGreaterThan(0);
			expect(most).toBeLessThanOrEqual(MERGE_MAX_DOTS);
			expect(landings(p)).toHaveLength(count);
			expect(landings(p).at(-1)?.ms).toBe(POUR_START_MS + POUR_SPAN_MS);
		}
	});

	it("drops each catch from above as the dot it was, in its colour, falling then merging", () => {
		const p = plan({
			catches: [caught(10), caught(400, { point: true, color: BLUE, value: 5 })],
			ticks: 450,
		});
		const end = POUR_START_MS + POUR_SPAN_MS;
		expect(pourAt(p, end - POUR_FALL_MS - 1).flights).toEqual([]);
		const falling = pourAt(p, end - POUR_FALL_MS / 2).flights;
		expect(falling).toEqual([{ color: BLUE, point: true, fall: 0.5, merge: 0 }]);
		const merging = pourAt(p, end + 1).flights;
		expect(merging).toHaveLength(1);
		expect(merging[0].fall).toBe(1);
		expect(merging[0].merge).toBeGreaterThan(0);
		expect(pourAt(p, end + 2000).flights).toEqual([]);
	});

	it("grows the drop from nothing as catches land, its area following the tally", () => {
		const p = plan({
			catches: [caught(10), caught(20, { step: 2, value: 3 }), caught(300, { value: 1 })],
			ticks: 400,
		});
		const [a, b, c] = landings(p).map((l) => l.ms);
		expect(pourAt(p, a - 1).drop).toMatchObject({ radius: 0, tally: 0 });
		const drops = [a, b, c].map((ms) => pourAt(p, ms).drop);
		expect(drops.map((d) => d.tally)).toEqual([1, 4, 5]);
		const [r1, r4, r5] = drops.map((d) => d.radius);
		expect(r1).toBeGreaterThan(0);
		expect(r4).toBeCloseTo(2 * r1);
		expect(r5 ** 2).toBeCloseTo(5 * r1 ** 2);
	});

	it("caps the drop's radius so a very high score still fits", () => {
		const many = Array.from({ length: 200 }, (_, i) => caught(10 + i * 20, { value: 5 }));
		const p = plan({ catches: many, ticks: 5000 });
		const settled = pourAt(p, 10_000).drop;
		expect(settled.tally).toBe(1000);
		expect(settled.radius).toBe(POUR_MAX_RADIUS);
		expect(pourAt(p, POUR_START_MS).drop.radius).toBeLessThan(POUR_MAX_RADIUS);
	});

	it("recolours the drop as point dots land and ends in the run's final colour", () => {
		const p = plan(
			{
				catches: [
					caught(10),
					caught(100, { point: true, color: BLUE, value: 5 }),
					caught(200, { color: BLUE }),
					caught(300, { point: true, color: GREEN, value: 5 }),
				],
				ticks: 320,
			},
			GREEN,
		);
		const colours = landings(p).map((l) => pourAt(p, l.ms).drop.color);
		expect(colours).toEqual([RED, BLUE, BLUE, GREEN]);
		expect(pourAt(p, 10_000).drop.color).toBe(GREEN);
	});

	it("has no drop and no catches for a run without catches", () => {
		const p = plan({ catches: [], ticks: seconds(9) }, BLUE);
		for (const ms of [0, POUR_START_MS, 10_000]) {
			const view = pourAt(p, ms, ms - 100);
			expect(view.drop).toEqual({ radius: 0, color: BLUE, tally: 0 });
			expect(view.flights).toEqual([]);
			expect(view.landings).toEqual([]);
		}
	});

	it("lays the tally out as dots centred on the drop, ink exactly where inside the drop", () => {
		const many = Array.from({ length: 40 }, (_, i) => caught(10 + i * 20, { value: 3 }));
		const p = plan({ catches: many, ticks: 1000 });
		for (const { ms } of landings(p)) {
			const { drop, digits } = pourAt(p, ms);
			expect(digits).toHaveLength(layoutDotMatrix(String(drop.tally)).dots.length);
			for (const dot of digits) expect(dot.ink).toBe(Math.hypot(dot.x, dot.y) < drop.radius);
		}
		// The first catch's small drop holds only the middle of its "3"; the final one all of "120"
		const first = pourAt(p, POUR_START_MS).digits;
		expect(first.some((d) => d.ink)).toBe(true);
		expect(first.some((d) => !d.ink)).toBe(true);
		expect(pourAt(p, 10_000).digits.every((d) => d.ink)).toBe(true);
	});

	it("keeps a zero-score run's digits in the drop's colour, never ink", () => {
		const p = plan({ catches: [], ticks: seconds(3) });
		const { digits } = pourAt(p, 10_000);
		expect(digits).toHaveLength(layoutDotMatrix("0").dots.length);
		expect(digits.every((d) => !d.ink)).toBe(true);
		// Centred on where the drop would be, a pitch apart
		const xs = digits.map((d) => d.x);
		const ys = digits.map((d) => d.y);
		expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs));
		expect(Math.min(...ys)).toBeCloseTo(-Math.max(...ys));
		expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(PITCH * (GLYPH_ROWS - 1));
	});

	it("sounds each landing once, at the catch's pitch, however the frames fall", () => {
		const steps = [1, 2, 3, 14, 1];
		const p = plan({
			catches: steps.map((step, i) =>
				caught(10 + i * 5, { step, point: i === 4, value: i === 4 ? 5 : 2 * step - 1 }),
			),
			ticks: 100,
		});
		const cued: { pitch: number; point: boolean }[] = [];
		for (let ms = 0, prev = -1; prev < 6000; prev = ms, ms += 16.7 + (ms % 7)) {
			cued.push(...pourAt(p, ms, prev).sounds);
		}
		expect(cued).toEqual([
			{ pitch: 0, point: false },
			{ pitch: 1, point: false },
			{ pitch: 2, point: false },
			{ pitch: 12, point: false },
			{ pitch: 0, point: true },
		]);
	});

	it("sounds a flurry once, at its highest pitch, while every catch in it still lands", () => {
		// A tick is 2.2 ms of the pour: the three in the middle land within a few ms
		const p = plan({
			catches: [
				caught(0),
				caught(400, { step: 2, value: 3 }),
				caught(401, { step: 4, value: 7 }),
				caught(402, { step: 3, value: 5 }),
				caught(1000),
			],
			ticks: 1100,
		});
		expect(landings(p)).toHaveLength(5);
		expect(sounds(p).map(({ pitch, point }) => ({ pitch, point }))).toEqual([
			{ pitch: 0, point: false },
			{ pitch: 3, point: false },
			{ pitch: 0, point: false },
		]);
		// Heard as the highest-pitched catch lands
		expect(sounds(p)[1].ms).toBe(landings(p)[2].ms);
	});

	it("sounds a point dot over the small dots of its flurry, however high they climb", () => {
		const p = plan({
			catches: [
				caught(0),
				caught(400, { step: 12, value: 23 }),
				caught(401, { point: true, color: BLUE, value: 5 }),
				caught(402, { step: 13, value: 25 }),
				caught(1000),
			],
			ticks: 1100,
		});
		expect(sounds(p).map(({ pitch, point }) => ({ pitch, point }))).toEqual([
			{ pitch: 0, point: false },
			{ pitch: 0, point: true },
			{ pitch: 0, point: false },
		]);
	});

	it("sounds a long flurry as a quick run of notes, one a window, its bursts all shown", () => {
		// A combo catch every 22 ms of the pour, each bursting
		const stream = Array.from({ length: 101 }, (_, i) => caught(i * 10, { step: 2, value: 3 }));
		const p = plan({ catches: stream, ticks: 1100 });
		const heard = sounds(p).map((s) => s.ms);
		expect(heard.length).toBeGreaterThan(POUR_SPAN_MS / (POUR_SOUND_WINDOW_MS + 10));
		for (let i = 1; i < heard.length; i++) {
			expect(heard[i] - heard[i - 1]).toBeGreaterThanOrEqual(POUR_SOUND_WINDOW_MS);
		}
		const landed = landings(p);
		expect(landed).toHaveLength(101);
		expect(landed.every((l) => l.bursts.length > 0)).toBe(true);
	});

	it("bursts a landing as the catch did in play, on the drop's top where it lands", () => {
		const p = plan({
			catches: [
				caught(10),
				caught(11, { step: 2, value: 3 }),
				caught(200, { point: true, color: BLUE, value: 5 }),
				caught(201, { point: true, color: GREEN, value: 7, step: 2 }),
			],
			ticks: 300,
		});
		const [lone, combo, point, comboPoint] = landings(p);
		const top = (k: number) => -p.drops[k].radius;
		// A lone small dot lands quietly
		expect(lone.bursts).toEqual([]);
		// A combo catch pops what it paid in combo amber
		expect(combo.bursts).toEqual([
			expect.objectContaining({ kind: "pop", x: 0, y: top(1), color: burstColor(COMBO_AMBER) }),
		]);
		// A point dot pops in its colour and rings in it; in a combo, its pop is amber
		expect(point.bursts).toEqual([
			expect.objectContaining({ kind: "pop", y: top(2), color: burstColor(BLUE) }),
			expect.objectContaining({ kind: "ring", y: top(2), color: burstColor(BLUE) }),
		]);
		expect(comboPoint.bursts).toEqual([
			expect.objectContaining({ kind: "pop", color: burstColor(COMBO_AMBER) }),
			expect.objectContaining({ kind: "ring", color: burstColor(GREEN) }),
		]);
		expect(combo.bursts[0].dots).toEqual(layOutBurst(0, popOf("3")).dots);
		const ids = [combo, point, comboPoint].flatMap((l) => l.bursts.map((b) => b.id));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("settles only once the last catch has landed and the drop has had time to come to rest", () => {
		const end = POUR_START_MS + POUR_SPAN_MS;
		for (const catches of [[caught(10), caught(90)], []]) {
			const p = plan({ catches, ticks: 120 });
			expect(pourAt(p, 0).settled).toBe(false);
			expect(pourAt(p, end).settled).toBe(false);
			expect(pourAt(p, end + POUR_SETTLE_MS - 1).settled).toBe(false);
			expect(pourAt(p, end + POUR_SETTLE_MS).settled).toBe(true);
		}
	});

	it("shows the combo bonus once settled: its share of the drop and a +N label", () => {
		// Three small dots in one combo pay 9, of which 6 is combo bonus
		const p = plan({
			catches: [caught(10), caught(12, { step: 2, value: 3 }), caught(14, { step: 3, value: 5 })],
			ticks: 60,
		});
		const settleAt = POUR_START_MS + POUR_SPAN_MS + POUR_SETTLE_MS;
		expect(pourAt(p, settleAt - 1)).toMatchObject({ amber: 0, bonusLabel: null });
		expect(pourAt(p, settleAt).amber).toBeCloseTo(6 / 9);
		expect(pourAt(p, settleAt).bonusLabel).toBe("+6");
	});

	it("has no combo mark when the run earned no combo bonus, or no score", () => {
		for (const catches of [[caught(10), caught(90, { point: true, value: 5 })], []]) {
			const p = plan({ catches, ticks: 120 });
			expect(pourAt(p, 10_000)).toMatchObject({ amber: 0, bonusLabel: null, settled: true });
		}
	});

	it("runs the clock up from 0:00 to the run time, reached exactly at the last landing", () => {
		const p = plan({ catches: [caught(30), caught(4000)], ticks: seconds(185) });
		const end = POUR_START_MS + POUR_SPAN_MS;
		expect(pourAt(p, 0).clock).toBe("0:00");
		expect(pourAt(p, POUR_START_MS).clock).toBe("0:00");
		expect(pourAt(p, POUR_START_MS + POUR_SPAN_MS / 2).clock).toBe("1:32");
		expect(pourAt(p, end - 1).clock).toBe("3:04");
		expect(landings(p).at(-1)?.ms).toBe(end);
		expect(pourAt(p, end).clock).toBe("3:05");
		expect(pourAt(p, end + 5000).clock).toBe("3:05");
	});

	it("shows the run time rounded down to whole seconds", () => {
		const p = plan({ catches: [caught(10)], ticks: 629 }); // 20.97 s
		expect(pourAt(p, POUR_START_MS + POUR_SPAN_MS).clock).toBe("0:20");
	});

	it("runs the clock over the same span for a run without catches", () => {
		const p = plan({ catches: [], ticks: seconds(42) });
		expect(pourAt(p, POUR_START_MS + POUR_SPAN_MS / 2).clock).toBe("0:21");
		expect(pourAt(p, POUR_START_MS + POUR_SPAN_MS).clock).toBe("0:42");
	});
});
