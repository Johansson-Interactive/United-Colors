/**
 * Pure stepper behind the game over's pour: the run replayed as its catches falling in, in the
 * order and rhythm they happened, and merging into one drop of the player's liquid, while a
 * clock runs up to the run time. Every run of POUR_FULL_SPAN_S or more pours in the same span
 * (POUR_SPAN_MS), whatever its length, and a shorter one in its share of it, so a short run
 * pours quickly. The catches count in at what they were worth on their own. The tally sits in
 * the drop throughout, as large as the drop holds it (see tallyPitchIn), growing with it, and only
 * spilling past its edge, at the smallest readable size, while the drop is still too small.
 * Once the drop settles, the combo bonus pours in: an amber body falls in, the amber rises as a
 * layer at the drop's bottom, the drop swells and the tally counts up to the score, so the bonus
 * is seen going into the total rather than written beside it. The tally rises into the drop's
 * top part, above the amber, fitting it as it goes, and the bonus fades in inside the amber as a
 * bare figure, with no sign to add: each figure held inside its own layer of the drop. A drop
 * too small to hold its figures readably swells as it settles until it does, bonus or not.
 *
 * planPour works a run's pour out once, on the JS thread; pourAt then samples it at a replay
 * time (ms since the game over appeared) as a plain view of everything the shell draws. pourAt
 * is a worklet and a pure function of time, so the shell samples it per frame from its own
 * clock. Pass it the previous sample's time too, and it lists the catches that landed in
 * between, each exactly once, for their kicks, and the sounds among them. The shell owns the
 * drawing, the jelly kicked on each landing, the sounds and where things are on the screen.
 */

import { catchPitch } from "../../application/catchCue";
import { MERGE_MAX_DOTS } from "../../application/renderScene";
import { comboBonus, ownValue, runSeconds } from "../../domain/run";
import type { RunCatch, RunRecord } from "../../domain/types";
import { layoutDotMatrix, type MatrixLayout } from "../dotmatrix/layout";
import { amberWaveReach } from "../mergeShader";
import { COMBO_AMBER } from "../theme/theme";

/** The first catch lands this long after the game over appears (ms) */
export const POUR_START_MS = 500;
/** From the first catch's landing to the last, and the clock's run up, at most (ms)... */
export const POUR_SPAN_MS = 2200;
/** ...taken by a run this long or longer (s) */
export const POUR_FULL_SPAN_S = 30;
/**
 * The span a second of run time takes, up to POUR_SPAN_MS (ms): a short run pours at the pace a
 * run of POUR_FULL_SPAN_S does, so quickly, rather than stretched over the whole span
 */
const POUR_MS_PER_RUN_S = POUR_SPAN_MS / POUR_FULL_SPAN_S;
/** A catch falls this long before it lands (ms), then merges into the drop for MERGE_MS */
export const POUR_FALL_MS = 420;
const MERGE_MS = 260;
/**
 * Bodies start falling at least this far apart (ms), about five frames, so that no more than
 * MERGE_MAX_DOTS are falling or merging at once: a millisecond over the share of that limit,
 * so one body's merge is over before the body MERGE_MAX_DOTS after it starts falling. Catches
 * of a flurry landing closer than this to the first of them fall with it, as one body.
 */
export const POUR_STAGGER_MS = Math.ceil((POUR_FALL_MS + MERGE_MS) / MERGE_MAX_DOTS) + 1;
/**
 * Landings are heard in windows this long (ms), each opened by the first landing after the one
 * before: at most one landing a window sounds, so a flurry is a quick run of notes, not a smear
 */
export const POUR_SOUND_WINDOW_MS = 60;
/**
 * The drop comes to rest this long after the last landing (ms); then the combo bonus lands.
 * Longer than a body's fall and merge, so the bonus body falls once every catch is in.
 */
export const POUR_SETTLE_MS = 700;
/**
 * Once the bonus lands, the amber rises from the drop's bottom to its level, the drop swells
 * and the tally counts up to the score, over this (ms); then the pour is settled...
 */
export const POUR_RISE_MS = 500;
/** ...and the bonus figure fades in over this (ms) */
export const POUR_FADE_MS = 300;
/** The tally ticks up through at most this many values as the bonus pours in */
export const POUR_COUNT_TICKS = 30;

/**
 * The smallest figure dot spacing still readable (px): the amber is at least this tall for the
 * bonus figure, and the drop's top part above it for the tally, where the drop holds both
 */
export const POUR_MIN_PITCH = 4;

/**
 * The drop's area follows the tally: its radius is this many px per root of the tally. A small
 * catch falls at this radius, a drop of one
 */
export const POUR_DOT_RADIUS = 9;
/** ...up to this radius (px), reached at a tally of about 200, so any score fits the screen */
export const POUR_MAX_RADIUS = 130;
/**
 * Room the amber's level keeps from the tally above it and the bonus figure below it (px): the whole
 * px past how far its surface waves at rest in the largest drop, so neither is touched
 */
const AMBER_CLEAR = Math.ceil(amberWaveReach({ stretchX: 0, stretchY: 0 }, POUR_MAX_RADIUS));
/** A catch lands at most this share of the drop's radius to either side of its middle */
const SIDE_REACH = 0.7;

export interface PourInput {
	record: RunRecord;
	/** The player's final colour */
	color: string;
	/** Centre-to-centre spacing of the tally's dots (px) */
	pitch: number;
}

/** Where a catch lands: the point of the drop's top it touches, from the drop's centre (px) */
interface PourSpot {
	x: number;
	y: number;
}

/** A catch sound to cue */
interface PourSound {
	/** Semitones the catch sound is raised (see catchPitch) */
	pitch: number;
	/** A point dot: the large catch sound */
	point: boolean;
}

/** One catch's landing: where, and whether a point dot, which knocks the drop harder */
interface PourLanding extends PourSpot {
	point: boolean;
}

/**
 * A body of catches on its way into the drop (see PlannedBody): it falls straight down onto
 * the spot its first catch lands on, then slides into the drop's centre
 */
export interface PourFlight extends PourSpot {
	color: string;
	/** How far it has fallen from above onto the drop, 0..1 */
	fall: number;
	/** How far it has merged into the drop once landed, 0..1 */
	merge: number;
}

/** The drop the catches pour into */
interface PourDrop {
	/** Radius (px); 0 before the first catch lands */
	radius: number;
	/** The colour of the catch that landed last, so a point dot recolours it */
	color: string;
	/** What the catches landed so far paid */
	tally: number;
}

/** One dot of the tally, from the drop's centre (px) */
interface PourDigitDot {
	x: number;
	y: number;
	/** Inside the drop, drawn in ink; outside it, drawn in the drop's colour */
	ink: boolean;
}

/** The combo bonus's figure, drawn in ink inside the amber layer */
interface PourBonusLabel {
	/** Its dots, from the drop's centre (px) */
	dots: readonly { x: number; y: number }[];
	/** Their spacing (px), never more than the tally's */
	pitch: number;
	/** 0 until the amber has risen, then fading in to 1 */
	opacity: number;
}

interface PlannedCatch extends PourLanding, PourSound {
	landMs: number;
	/** Its landing is heard: the loudest in its sound window (see soundingOf) */
	heard: boolean;
}

/**
 * One body falling into the drop: a catch, or a flurry's catches landing within
 * POUR_STAGGER_MS of the first of them, in its colour (see bodyColor); or the combo bonus, in
 * amber. A catch body lands with its first catch; the others land into it as it merges, at
 * their own times.
 */
interface PlannedBody extends PourSpot {
	color: string;
	landMs: number;
}

/** The tally at one tick of its count up to the score, as the bonus pours in */
interface PourCount {
	tally: number;
	/** Its dots, centred on the drop and not yet lifted; `ink` as in the drop at that tally */
	digits: readonly PourDigitDot[];
}

/** A run's pour, worked out once; sample it with pourAt */
export interface PourPlan {
	catches: readonly PlannedCatch[];
	bodies: readonly PlannedBody[];
	/** The drop and its tally's dots once `k` catches have landed, by `k`, at their own value */
	drops: readonly PourDrop[];
	digits: readonly (readonly PourDigitDot[])[];
	/** The run's combo bonus; 0 without one */
	bonus: number;
	/**
	 * The bonus body, falling in amber onto the drop once it has settled, landing at settleMs;
	 * null without a combo bonus
	 */
	bonusBody: PlannedBody | null;
	/** The tally's count from what the catches were worth alone up to the score, by tick */
	counts: readonly PourCount[];
	/**
	 * The drop once settled, the bonus poured in: the run's score, in its final colour, never
	 * smaller than holds its figures readably (see settledRadius). The drop swells to it as it
	 * settles where the bonus pours in or the last catch's drop is smaller.
	 */
	settledDrop: PourDrop;
	/** The run time (s), which the clock reaches at the last landing */
	seconds: number;
	/** When the last catch lands, and the clock reaches the run time (ms) */
	endMs: number;
	/** When the drop comes to rest, POUR_SETTLE_MS after that, and the bonus lands (ms) */
	settleMs: number;
	/**
	 * When the pour is settled: POUR_RISE_MS after settleMs where the drop swells as it settles
	 * (see settledDrop), otherwise at settleMs
	 */
	restMs: number;
	/**
	 * The settled amber layer's level, in radii below the drop's centre: where it cuts off the
	 * combo bonus's share of the drop, raised to hold its figure; 1, the drop's bottom, without one
	 */
	level: number;
	/** The tally's dot spacing in play (px), as given: the most it is ever drawn at */
	pitch: number;
	/**
	 * The settled tally's dot spacing (px), by the one rule (see tallyPitchIn): as large as its room
	 * holds, the whole drop, or with a combo bonus the drop's top part above the amber
	 */
	tallyPitch: number;
	/** How far the settled tally's middle sits from the drop's centre (px, so negative: up) */
	lift: number;
	/** The score's figure in cells, which the tally is fitted as all through the pour */
	tallyCells: { cols: number; rows: number };
	/** The settled bonus figure; null without a combo bonus */
	bonusLabel: Omit<PourBonusLabel, "opacity"> | null;
}

/** What the shell draws at one moment of the pour */
export interface PourView {
	/** Catches that landed after the previous sample, up to this one, in order */
	landings: PourLanding[];
	/** The sounds of those landings that are heard, and the bonus landing's, in order */
	sounds: PourSound[];
	/** Bodies falling or merging, in landing order; never more than MERGE_MAX_DOTS */
	flights: PourFlight[];
	/** The bonus body's landing, when it landed after the previous sample, up to this one */
	bonusLanding: PourLanding | null;
	/**
	 * The stepper's drop: at what the catches were worth alone, then swelling to its settled
	 * size as the bonus pours in or to hold its tally readably. The shell kicks, steps and
	 * fills the liquid by it, and eases what it draws toward it.
	 */
	drop: PourDrop;
	/**
	 * How far the drop has swelled as it settles so far (px); 0 before then and for a pour that
	 * does not swell. Already smooth, unlike the landings' jumps, so the shell need not ease it.
	 */
	swell: number;
	/**
	 * The tally's dots, lifted with the amber as it rises into the top part; `ink` where inside
	 * the drop as drawn (pourAt's `drawnRadius`), not the stepper's `drop`
	 */
	digits: readonly PourDigitDot[];
	/**
	 * Their spacing (px), which the shell sizes them by: as large as the drop as drawn holds them
	 * (see tallyPitchIn)
	 */
	tallyPitch: number;
	/** The clock: run time so far as `M:SS`, rounded down */
	clock: string;
	/**
	 * The amber layer's surface, in radii below the drop's centre: once the bonus lands, it
	 * rises from the drop's bottom (1) to the plan's level, held back while the tally would
	 * stand in it; null before then, while held back, and without a combo bonus
	 */
	amberLevel: number | null;
	/** The bonus figure inside the amber layer; null without a combo bonus */
	bonusLabel: PourBonusLabel | null;
	/** The pour is at rest, the bonus poured in: `NEW BEST!` and confetti may follow */
	settled: boolean;
}

/** The span a run of `seconds` pours over (ms): POUR_MS_PER_RUN_S a second, up to POUR_SPAN_MS */
function spanOf(seconds: number): number {
	return Math.min(POUR_SPAN_MS, seconds * POUR_MS_PER_RUN_S);
}

/**
 * When each catch lands: its run tick mapped onto a span of `spanMs`, the first at its start
 * and the last exactly at its end (all at the end when they share one tick), so the run keeps
 * its rhythm
 */
function landTimes(ticks: readonly number[], spanMs: number): number[] {
	const first = ticks[0];
	const runSpan = ticks[ticks.length - 1] - first;
	return ticks.map((tick) => POUR_START_MS + spanMs * (runSpan > 0 ? (tick - first) / runSpan : 1));
}

/**
 * The bodies the catches landing at `times` into `drops` fall in, at least POUR_STAGGER_MS
 * apart, and the spot each catch lands on: its body's, the one its first catch lands on, so
 * every catch of a body lands and kicks where the body is drawn landing
 */
function bodiesOf(
	catches: readonly RunCatch[],
	times: readonly number[],
	drops: readonly PourDrop[],
): { bodies: PlannedBody[]; spots: PourSpot[] } {
	const bodies: PlannedBody[] = [];
	const spots: PourSpot[] = [];
	for (let i = 0; i < catches.length; ) {
		const landMs = times[i];
		const spot = landingSpot(i, drops[i].radius);
		spots.push(spot);
		let next = i + 1;
		for (; next < catches.length && times[next] < landMs + POUR_STAGGER_MS; next++) {
			spots.push(spot);
		}
		bodies.push({ color: bodyColor(catches.slice(i, next)), landMs, ...spot });
		i = next;
	}
	return { bodies, spots };
}

/**
 * The colour a body of `catches` falls in: its first point dot's, which recolours the drop;
 * otherwise its first catch's. Never amber: a combo catch falls at its own value in its own
 * colour, and the amber falls once, as the bonus.
 */
function bodyColor(catches: readonly RunCatch[]): string {
	return (catches.find((c) => c.point) ?? catches[0]).color;
}

/**
 * A share of -1..1 that looks random but is always the same for the same `n`: a 32-bit integer
 * mix, so neighbouring catches land far apart
 */
function seededSide(n: number): number {
	let h = Math.imul(n + 1, 0x9e3779b1);
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	h ^= h >>> 16;
	return ((h >>> 0) / 0x100000000) * 2 - 1;
}

/**
 * Where the run's `index`th catch lands on a drop of `radius`: on its curved top, a seeded
 * share of SIDE_REACH to one side, so a run always pours the same way
 */
function landingSpot(index: number, radius: number): PourSpot {
	const x = seededSide(index) * SIDE_REACH * radius;
	return { x, y: -Math.sqrt(radius * radius - x * x) };
}

/** Whether sound `a` wins a window over `b`: a point dot, otherwise the higher pitch */
function louder(a: PourSound, b: PourSound): boolean {
	return a.point !== b.point ? a.point : a.pitch > b.pitch;
}

/**
 * Whether each catch sounding `cues` at `times` is heard: in each POUR_SOUND_WINDOW_MS window,
 * only the loudest catch (see louder), the first of them on a tie
 */
function soundingOf(cues: readonly PourSound[], times: readonly number[]): boolean[] {
	const sounding = cues.map(() => false);
	for (let i = 0; i < cues.length; ) {
		const windowEnd = times[i] + POUR_SOUND_WINDOW_MS;
		let heard = i;
		let next = i + 1;
		for (; next < cues.length && times[next] < windowEnd; next++) {
			if (louder(cues[next], cues[heard])) heard = next;
		}
		sounding[heard] = true;
		i = next;
	}
	return sounding;
}

/** The radius of a drop holding `tally` (px): its area follows the tally, up to POUR_MAX_RADIUS */
function radiusOf(tally: number): number {
	"worklet";
	return Math.min(POUR_MAX_RADIUS, POUR_DOT_RADIUS * Math.sqrt(tally));
}

/**
 * The drop as each catch lands, counting what the catch was worth on its own; before any,
 * empty in the first catch's colour or `color`
 */
function dropsOf({ catches }: RunRecord, color: string): PourDrop[] {
	const drops: PourDrop[] = [{ radius: 0, color: catches[0]?.color ?? color, tally: 0 }];
	for (const c of catches) {
		const tally = drops[drops.length - 1].tally + ownValue(c);
		drops.push({ radius: radiusOf(tally), color: c.color, tally });
	}
	return drops;
}

/**
 * The tally's count from `from` up to `score`: through every value when the bonus is small,
 * otherwise through POUR_COUNT_TICKS evenly spaced ones, so a large bonus still counts in over
 * the rise rather than in one jump, and the plan stays small
 */
function countsOf(from: number, score: number, pitch: number): PourCount[] {
	const bonus = score - from;
	const ticks = Math.min(bonus, POUR_COUNT_TICKS);
	const counts: PourCount[] = [];
	for (let k = 0; k <= ticks; k++) {
		const tally = from + Math.round((bonus * k) / ticks);
		counts.push({ tally, digits: digitsOf({ tally, radius: radiusOf(tally), color: "" }, pitch) });
	}
	return counts;
}

/** A drop's tally as dot-matrix dots at `pitch`, centred on the drop */
function digitsOf({ tally, radius }: PourDrop, pitch: number): PourDigitDot[] {
	const { dots, cols, rows } = layoutDotMatrix(String(tally));
	return dots.map(({ col, row }) => {
		const x = (col + 0.5 - cols / 2) * pitch;
		const y = (row + 0.5 - rows / 2) * pitch;
		return { x, y, ink: Math.hypot(x, y) < radius };
	});
}

/**
 * The part of a drop's area below a level `d` radii under its centre: the part of a unit circle
 * below a line `d` under its centre, over the circle's area, falling from 1 to 0 as `d` runs
 * from -1 to 1
 */
function shareBelow(d: number): number {
	return (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}

/** Halvings a search takes (see bisect): to well under a thousandth of a px over any range here */
const BISECT_STEPS = 30;

/**
 * Where `below` stops holding between `lo`, where it holds, and `hi`, where it does not, after
 * BISECT_STEPS halvings: the last point found where it still holds, and the first where it does not
 */
function bisect(lo: number, hi: number, below: (x: number) => boolean) {
	"worklet";
	let low = lo;
	let high = hi;
	for (let i = 0; i < BISECT_STEPS; i++) {
		const mid = (low + high) / 2;
		if (below(mid)) low = mid;
		else high = mid;
	}
	return { lo: low, hi: high };
}

/**
 * Where the amber layer's level sits, in radii below the drop's centre (1 is its bottom, -1 its
 * top), so that the part of the drop below it is `share` of the drop's area
 */
function levelForShare(share: number): number {
	const { lo, hi } = bisect(-1, 1, (d) => shareBelow(d) > share);
	return (lo + hi) / 2;
}

/** A figure's size in dot-matrix cells */
type Cells = Pick<MatrixLayout, "cols" | "rows">;

/**
 * Where a box of `cells` at `pitch` can go in a drop of `radius` under an amber surface
 * `surface` px below its centre, clear of it, or anywhere in the drop without amber (null): the
 * highest its top can be, and the height to spare under the box from there, as the drop's
 * outline narrows away from its middle; negative when it does not fit
 */
function roomUnder(radius: number, surface: number | null, { cols, rows }: Cells, pitch: number) {
	"worklet";
	const half = (cols * pitch) / 2;
	// How far from the centre the drop is still as wide as the box
	const reach = half < radius ? Math.sqrt(radius * radius - half * half) : 0;
	const top = surface === null ? -reach : Math.max(-reach, surface + AMBER_CLEAR);
	return { top, spare: reach - top - rows * pitch };
}

/**
 * The lowest a surface can be, px below the centre of a drop of `radius`, with a box of `cells`
 * still fitting under it at POUR_MIN_PITCH; null when it fits under none
 */
function lowestSurface(radius: number, cells: Cells): number | null {
	const least = roomUnder(radius, -radius, cells, POUR_MIN_PITCH);
	return least.spare >= 0 ? least.top + least.spare - AMBER_CLEAR : null;
}

/**
 * A box of `cells` under a surface `surface` px below the centre of a drop of `radius`, or
 * anywhere in it without one (null): as large as it fits, up to `pitch`, however small that is,
 * and centred in the room it has there; its top
 */
function fitUnder(radius: number, surface: number | null, cells: Cells, pitch: number) {
	"worklet";
	const fits = (p: number) => roomUnder(radius, surface, cells, p).spare >= 0;
	const fitted = fits(pitch) ? pitch : bisect(0, pitch, fits).lo;
	const { top, spare } = roomUnder(radius, surface, cells, fitted);
	return { pitch: fitted, top: top + spare / 2 };
}

/**
 * A box of `cells` over a surface `surface` px below the centre of a drop of `radius`, or
 * anywhere in it without one (null), as fitUnder: the room over a surface is the room under it,
 * upside down, so its top is measured up from the drop's centre
 */
function fitOver(radius: number, surface: number | null, cells: Cells, pitch: number) {
	"worklet";
	return fitUnder(radius, surface === null ? null : -surface, cells, pitch);
}

/**
 * The one rule for the tally's size, as it pours and once settled, with or without a combo
 * bonus: its dot spacing in a drop of `radius`, over an amber surface `surface` px below its
 * centre, or in the whole drop without amber (null), as large as fits, never more than its
 * in-play `pitch` nor less than POUR_MIN_PITCH. It is fitted as the score's figure, the widest
 * it gets, so its size follows the drop and never jumps as a digit is added. An empty run's is
 * `pitch`, as it has no drop to fit its 0 into.
 */
function tallyPitchIn(
	{ settledDrop, tallyCells, pitch }: Pick<PourPlan, "settledDrop" | "tallyCells" | "pitch">,
	radius: number,
	surface: number | null,
): number {
	"worklet";
	if (settledDrop.tally === 0) return pitch;
	return Math.max(POUR_MIN_PITCH, fitOver(radius, surface, tallyCells, pitch).pitch);
}

/** A combo bonus's figure, and the bonus's share of the score */
interface BonusFigure {
	figure: MatrixLayout;
	share: number;
}

/** The settled drop's figures, laid out once */
interface Figures {
	/** The score's figure */
	tally: MatrixLayout;
	/** null without a combo bonus */
	bonus: BonusFigure | null;
}

/**
 * The amber's surface in a settled drop of `radius`, px below its centre, and each figure fitted
 * inside its own layer, as large as the layer holds up to `pitch`, however small: the bonus
 * under the surface and the tally over it. The surface sits at the bonus's share of the drop,
 * raised where needed to hold the bonus figure at POUR_MIN_PITCH, and lowered where the tally
 * would come out smaller than the bonus figure, to where the two match: the total never reads
 * as less than its part.
 */
function amberOf(
	tally: MatrixLayout,
	{ figure, share }: BonusFigure,
	radius: number,
	pitch: number,
) {
	const bonusAt = (surface: number) => fitUnder(radius, surface, figure, pitch);
	const tallyAt = (surface: number) => fitOver(radius, surface, tally, pitch);
	const squeezed = (surface: number) => tallyAt(surface).pitch < bonusAt(surface).pitch;
	const under = lowestSurface(radius, figure) ?? -radius;
	const atShare = Math.min(levelForShare(share) * radius, under);
	const surface = squeezed(atShare) ? bisect(atShare, radius, squeezed).hi : atShare;
	return { surface, tally: tallyAt(surface), bonus: bonusAt(surface) };
}

/**
 * A fit's search stops a hair under the size that just fits (see bisect), so a figure this
 * close to POUR_MIN_PITCH is held at it (px)
 */
const FIT_SLACK = 1e-6;

/**
 * Whether a settled drop of `radius` holds its figures at POUR_MIN_PITCH or more: the tally in
 * the whole drop, or with a combo bonus, the tally over the amber and the bonus figure in it
 */
function holdsFigures({ tally, bonus }: Figures, radius: number, pitch: number): boolean {
	const readable = (fit: { pitch: number }) => fit.pitch >= POUR_MIN_PITCH - FIT_SLACK;
	if (bonus === null) return readable(fitOver(radius, null, tally, pitch));
	const amber = amberOf(tally, bonus, radius, pitch);
	return readable(amber.tally) && readable(amber.bonus);
}

/**
 * The settled drop's radius: the score's own (see radiusOf), or where that is too small to hold
 * its figures readably (see holdsFigures), the smallest that does. This bends "the drop's area
 * follows the tally" for tiny scores only, once settled: the catches still land at their worth.
 * An empty run has no figure to hold.
 */
function settledRadius(figures: Figures, score: number, pitch: number): number {
	const radius = radiusOf(score);
	if (score === 0 || holdsFigures(figures, radius, pitch)) return radius;
	return bisect(radius, POUR_MAX_RADIUS, (r) => !holdsFigures(figures, r, pitch)).hi;
}

/**
 * The amber layer of a settled drop of `radius` (see amberOf): its surface, its level in radii,
 * how far the tally over it is lifted, and the bonus figure in it, a bare figure: the bonus is
 * seen pouring into the tally, so there is no `+` to add. The drop settles where it holds the
 * figure (see settledRadius), so it is never drawn under POUR_MIN_PITCH: a fit a hair under it
 * (see FIT_SLACK) is brought up to it, as the tally's is.
 */
function settledAmber(tally: MatrixLayout, bonus: BonusFigure, radius: number, pitch: number) {
	const amber = amberOf(tally, bonus, radius, pitch);
	const { figure } = bonus;
	const labelPitch = Math.max(POUR_MIN_PITCH, amber.bonus.pitch);
	const dots = figure.dots.map(({ col, row }) => ({
		x: (col + 0.5 - figure.cols / 2) * labelPitch,
		y: amber.bonus.top + (row + 0.5) * labelPitch,
	}));
	return {
		surface: amber.surface,
		level: amber.surface / radius,
		lift: -(amber.tally.top + (tally.rows * amber.tally.pitch) / 2),
		label: { dots, pitch: labelPitch },
	};
}

/** Work out a run's pour */
export function planPour({ record, color, pitch }: PourInput): PourPlan {
	const { catches } = record;
	const seconds = runSeconds(record.ticks);
	const spanMs = spanOf(seconds);
	const endMs = POUR_START_MS + spanMs;
	const times = landTimes(
		catches.map((c) => c.tick),
		spanMs,
	);
	const drops = dropsOf(record, color);
	const cues = catches.map((c) => ({ pitch: catchPitch(c.step), point: c.point }));
	const sounding = soundingOf(cues, times);
	const poured = drops[drops.length - 1];
	const bonus = comboBonus(record);
	const score = poured.tally + bonus;
	const figures: Figures = {
		tally: layoutDotMatrix(String(score)),
		bonus: bonus > 0 ? { figure: layoutDotMatrix(String(bonus)), share: bonus / score } : null,
	};
	const radius = settledRadius(figures, score, pitch);
	const settledDrop: PourDrop = { radius, color: poured.color, tally: score };
	// The drop swells as it settles when the bonus pours in, or to hold its tally readably
	const swells = bonus > 0 || radius > poured.radius;
	const amber = figures.bonus ? settledAmber(figures.tally, figures.bonus, radius, pitch) : null;
	const tallyCells = { cols: figures.tally.cols, rows: figures.tally.rows };
	const { bodies, spots } = bodiesOf(catches, times, drops);
	const settleMs = endMs + POUR_SETTLE_MS;
	return {
		catches: catches.map((_, i) => ({
			...cues[i],
			...spots[i],
			landMs: times[i],
			heard: sounding[i],
		})),
		bodies,
		drops,
		digits: drops.map((drop) => digitsOf(drop, pitch)),
		bonus,
		// Onto the settled drop's top, dead centre
		bonusBody: amber ? { color: COMBO_AMBER, landMs: settleMs, x: 0, y: -poured.radius } : null,
		counts: amber ? countsOf(poured.tally, score, pitch) : [],
		settledDrop,
		seconds,
		endMs,
		settleMs,
		restMs: swells ? settleMs + POUR_RISE_MS : settleMs,
		level: amber?.level ?? 1,
		pitch,
		tallyPitch: tallyPitchIn({ settledDrop, tallyCells, pitch }, radius, amber?.surface ?? null),
		lift: amber?.lift ?? 0,
		tallyCells,
		bonusLabel: amber?.label ?? null,
	};
}

function clamp01(x: number): number {
	"worklet";
	return Math.min(1, Math.max(0, x));
}

/** Whole seconds as `M:SS` */
function formatClock(seconds: number): string {
	"worklet";
	const whole = Math.floor(seconds);
	const ss = whole % 60;
	return `${Math.floor(whole / 60)}:${ss < 10 ? "0" : ""}${ss}`;
}

/**
 * How far the clock has run up at `ms`, 0..1, reaching 1 at `endMs`: checked, not divided out,
 * as dividing can round to just under 1, a second short, and a run without time has no span
 */
function clockShare(endMs: number, ms: number): number {
	"worklet";
	return ms >= endMs ? 1 : clamp01((ms - POUR_START_MS) / (endMs - POUR_START_MS));
}

/** How many catches have landed by `ms` */
function landedBy(plan: PourPlan, ms: number): number {
	"worklet";
	let landed = 0;
	for (const c of plan.catches) if (c.landMs <= ms) landed++;
	return landed;
}

/**
 * How far the drop has swelled to its settled size at `ms`, 0..1, easing in and out over
 * POUR_RISE_MS from settleMs; null before then, and for a pour that does not swell
 */
function swellShare(plan: PourPlan, ms: number): number | null {
	"worklet";
	if (plan.restMs === plan.settleMs || ms < plan.settleMs) return null;
	const t = clamp01((ms - plan.settleMs) / POUR_RISE_MS);
	return t * t * (3 - 2 * t);
}

/**
 * The drop at `ms`, at what the catches landed so far were worth, then swelling to its settled
 * size, its area growing evenly; and how far it has swelled (see PourView)
 */
export function dropAt(plan: PourPlan, ms: number): Pick<PourView, "drop" | "swell"> {
	"worklet";
	const risen = swellShare(plan, ms);
	if (risen === null) return { drop: plan.drops[landedBy(plan, ms)], swell: 0 };
	const poured = plan.drops[plan.drops.length - 1];
	const from = poured.radius ** 2;
	const radius = Math.sqrt(from + (plan.settledDrop.radius ** 2 - from) * risen);
	const tally = plan.bonusBody
		? plan.counts[Math.round(risen * (plan.counts.length - 1))].tally
		: poured.tally;
	return { drop: { radius, color: plan.settledDrop.color, tally }, swell: radius - poured.radius };
}

/**
 * The pour at `ms` since the game over appeared, with the landings since `sinceMs`. The view's
 * drop is the stepper's (see dropAt); its tally, though, is fitted to and inked against the drop
 * as the shell draws it, `drawnRadius` px, which lags the stepper's as the shell eases the
 * landings' jumps, so figure and vessel move together on screen. The stepper's own radius by
 * default, for a caller that draws the drop as the stepper has it.
 */
export function pourAt(plan: PourPlan, ms: number, sinceMs = ms, drawnRadius?: number): PourView {
	"worklet";
	const landings: PourLanding[] = [];
	const sounds: PourSound[] = [];
	const flights: PourFlight[] = [];
	for (const c of plan.catches) {
		if (c.landMs > sinceMs && c.landMs <= ms) {
			landings.push({ x: c.x, y: c.y, point: c.point });
			if (c.heard) sounds.push({ pitch: c.pitch, point: c.point });
		}
	}
	const { bonusBody } = plan;
	const bodies = bonusBody ? [...plan.bodies, bonusBody] : plan.bodies;
	for (const b of bodies) {
		if (ms >= b.landMs - POUR_FALL_MS && ms < b.landMs + MERGE_MS) {
			flights.push({
				color: b.color,
				x: b.x,
				y: b.y,
				fall: clamp01((ms - b.landMs + POUR_FALL_MS) / POUR_FALL_MS),
				merge: clamp01((ms - b.landMs) / MERGE_MS),
			});
		}
	}
	let bonusLanding: PourLanding | null = null;
	if (bonusBody && bonusBody.landMs > sinceMs && bonusBody.landMs <= ms) {
		bonusLanding = { x: bonusBody.x, y: bonusBody.y, point: false };
		// Heard at the pitch the run's combos climbed to
		let top = 0;
		for (const c of plan.catches) top = Math.max(top, c.pitch);
		sounds.push({ pitch: top, point: false });
	}
	const { drop, swell } = dropAt(plan, ms);
	const radius = drawnRadius ?? drop.radius;
	// The tally's size follows the drop as drawn, by the one rule
	let tallyPitch = tallyPitchIn(plan, radius, null);
	let digits = plan.digits[landedBy(plan, ms)];
	let amberLevel: number | null = null;
	let lift = 0;
	const risen = swellShare(plan, ms);
	if (bonusBody && risen !== null) {
		// The bonus pours in: the amber's surface and the tally above it rise together, while
		// the drop swells, the tally ticks up to the score and eases from its size in the whole
		// drop to its size in the top part
		const poured = plan.drops[plan.drops.length - 1];
		digits = plan.counts[Math.round(risen * (plan.counts.length - 1))].digits;
		lift = plan.lift * risen;
		const from = tallyPitchIn(plan, poured.radius, null);
		tallyPitch = from + (plan.tallyPitch - from) * risen;
		// Never up into the tally: the amber waits under it until the lift and the swell make
		// room, so the tally's ink never stands in amber
		const clear = (lift + (plan.tallyCells.rows * tallyPitch) / 2 + AMBER_CLEAR) / drop.radius;
		const level = Math.max(1 + (plan.level - 1) * risen, clear);
		amberLevel = level < 1 ? level : null;
	}
	const shrink = tallyPitch / plan.pitch;
	const sized: PourDigitDot[] = [];
	for (const dot of digits) {
		const x = dot.x * shrink;
		const y = dot.y * shrink + lift;
		sized.push({ x, y, ink: Math.hypot(x, y) < radius });
	}
	const { bonusLabel } = plan;
	return {
		landings,
		sounds,
		flights,
		bonusLanding,
		drop,
		swell,
		digits: sized,
		tallyPitch,
		clock: formatClock(plan.seconds * clockShare(plan.endMs, ms)),
		amberLevel,
		bonusLabel: bonusLabel && {
			dots: bonusLabel.dots,
			pitch: bonusLabel.pitch,
			opacity: clamp01((ms - plan.settleMs - POUR_RISE_MS) / POUR_FADE_MS),
		},
		settled: ms >= plan.restMs,
	};
}
