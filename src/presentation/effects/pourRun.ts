/**
 * Pure stepper behind the game over's pour: the run replayed as its catches falling in, in the
 * order and rhythm they happened, and merging into one drop of the player's liquid, while a
 * clock runs up to the run time. Every run of POUR_FULL_SPAN_S or more pours in the same span
 * (POUR_SPAN_MS), whatever its length, and a shorter one at the same pace, so in less; once it
 * settles, the combo bonus rises in as an amber layer at the drop's bottom, the
 * tally lifting clear of it, and its `+N` fades in inside it.
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
import { comboBonus, runSeconds } from "../../domain/run";
import type { RunCatch, RunRecord } from "../../domain/types";
import { layoutDotMatrix } from "../dotmatrix/layout";
import { amberWaveReach } from "../mergeShader";

/** The first catch lands this long after the game over appears (ms) */
export const POUR_START_MS = 500;
/** From the first catch's landing to the last, and the clock's run up, for a long run (ms)... */
export const POUR_SPAN_MS = 2200;
/**
 * ...one this long or longer (s); a shorter run pours over its share of the span, so a run of a
 * few catches lands them close together rather than dripping them in
 */
export const POUR_FULL_SPAN_S = 30;
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
/** The drop comes to rest this long after the last landing (ms); then the pour is settled */
export const POUR_SETTLE_MS = 700;
/** Once settled, the amber layer rises from the drop's bottom to its level over this (ms)... */
export const POUR_RISE_MS = 500;
/** ...then its `+N` fades in over this (ms) */
export const POUR_FADE_MS = 300;

/** The smallest `+N` dot spacing still readable (px): the amber layer is at least this tall */
export const POUR_BONUS_MIN_PITCH = 4;

/**
 * The drop's area follows the tally: its radius is this many px per root of the tally. A small
 * catch falls at this radius, a drop of one
 */
export const POUR_DOT_RADIUS = 9;
/** ...up to this radius (px), reached at a tally of about 200, so any score fits the screen */
export const POUR_MAX_RADIUS = 130;
/**
 * Room the amber's level keeps from the tally above it and from `+N` below it (px): the whole
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

/**
 * One catch's landing: where, and whether a point dot, which knocks the drop harder. It neither
 * pops nor rings, as it did in play: the tally tells what it paid.
 */
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

/** The combo bonus's `+N`, drawn in ink inside the amber layer */
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
 * POUR_STAGGER_MS of the first of them. It looks like its first point dot, or its first catch,
 * and lands with its first catch; the others land into it as it merges, at their own times.
 */
interface PlannedBody extends PourSpot {
	color: string;
	landMs: number;
}

/** A run's pour, worked out once; sample it with pourAt */
export interface PourPlan {
	catches: readonly PlannedCatch[];
	bodies: readonly PlannedBody[];
	/** The drop and its tally's dots once `k` catches have landed, by `k` */
	drops: readonly PourDrop[];
	/** The drop once every catch has landed */
	settledDrop: PourDrop;
	digits: readonly (readonly PourDigitDot[])[];
	/** The run time (s), which the clock reaches at the last landing */
	seconds: number;
	/** From the first catch's landing to the last, and the clock's run up (ms) */
	spanMs: number;
	settleMs: number;
	/**
	 * The settled amber layer's level, in radii below the drop's centre: where it cuts off the
	 * combo bonus's share of the drop, raised to hold `+N`; 1, the drop's bottom, without one
	 */
	level: number;
	/** How far the settled tally sits from the drop's centre (px, so negative: up) */
	lift: number;
	/** The settled `+N`; null without a combo bonus */
	bonusLabel: Omit<PourBonusLabel, "opacity"> | null;
}

/** What the shell draws at one moment of the pour */
export interface PourView {
	/** Catches that landed after the previous sample, up to this one, in order */
	landings: PourLanding[];
	/** The sounds of those landings that are heard, in order */
	sounds: PourSound[];
	/** Bodies falling or merging, in landing order; never more than MERGE_MAX_DOTS */
	flights: PourFlight[];
	drop: PourDrop;
	/** The tally's dots, lifted with the amber as it rises */
	digits: readonly PourDigitDot[];
	/** The clock: run time so far as `M:SS`, rounded down */
	clock: string;
	/**
	 * The amber layer's surface, in radii below the drop's centre: once settled, it rises from
	 * the drop's bottom (1) to the plan's level; null before then, and without a combo bonus
	 */
	amberLevel: number | null;
	/** `+N` inside the amber layer; null without a combo bonus */
	bonusLabel: PourBonusLabel | null;
	/** The drop is at rest: `NEW BEST!` and confetti may follow */
	settled: boolean;
}

/** The span a run of `seconds` pours over (ms): all of it from POUR_FULL_SPAN_S on */
function spanOf(seconds: number): number {
	return POUR_SPAN_MS * Math.min(1, seconds / POUR_FULL_SPAN_S);
}

/**
 * When each catch lands: its run tick mapped onto a span of `spanMs`, the first at its start
 * and the last at its end (all at the end when they share one tick), so the run keeps its rhythm
 */
function landTimes(ticks: readonly number[], spanMs: number): number[] {
	const first = ticks[0];
	const runSpan = ticks[ticks.length - 1] - first;
	const end = POUR_START_MS + spanMs;
	return ticks.map((tick) =>
		runSpan > 0 ? POUR_START_MS + (spanMs * (tick - first)) / runSpan : end,
	);
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
		let look = catches[i];
		spots.push(spot);
		let next = i + 1;
		for (; next < catches.length && times[next] < landMs + POUR_STAGGER_MS; next++) {
			if (catches[next].point && !look.point) look = catches[next];
			spots.push(spot);
		}
		bodies.push({ color: look.color, landMs, ...spot });
		i = next;
	}
	return { bodies, spots };
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

/** The drop as each catch lands; before any, empty in the first catch's colour or `color` */
function dropsOf({ catches }: RunRecord, color: string): PourDrop[] {
	const drops: PourDrop[] = [{ radius: 0, color: catches[0]?.color ?? color, tally: 0 }];
	for (const c of catches) {
		const tally = drops[drops.length - 1].tally + c.value;
		const radius = Math.min(POUR_MAX_RADIUS, POUR_DOT_RADIUS * Math.sqrt(tally));
		drops.push({ radius, color: c.color, tally });
	}
	return drops;
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

/**
 * Where the amber layer's level sits, in radii below the drop's centre (1 is its bottom, -1 its
 * top), so that the part of the drop below it is `share` of the drop's area
 */
function levelForShare(share: number): number {
	let lo = -1;
	let hi = 1;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		if (shareBelow(mid) > share) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/**
 * Where a box `cols` by `rows` cells at `pitch` can go in a drop of `radius` under a surface
 * `surface` px below its centre, clear of it: the highest its top can be, and the height to
 * spare under the box from there, as the drop's outline narrows away from its middle; negative
 * when it does not fit
 */
function roomUnder(radius: number, surface: number, cols: number, rows: number, pitch: number) {
	const half = (cols * pitch) / 2;
	// How far from the centre the drop is still as wide as the box
	const reach = half < radius ? Math.sqrt(radius * radius - half * half) : 0;
	const top = Math.max(-reach, surface + AMBER_CLEAR);
	return { top, spare: reach - top - rows * pitch };
}

/**
 * The settled amber layer, `bonus` of `score`, in a drop of `radius` whose tally's dots are
 * `pitch` apart: its level, raised where needed to hold `+N` at POUR_BONUS_MIN_PITCH, and `+N`
 * centred in it, as large as the layer holds up to `pitch`
 */
function amberOf(bonus: number, score: number, radius: number, pitch: number) {
	const layout = layoutDotMatrix(`+${bonus}`);
	const { cols, rows } = layout;
	const least = roomUnder(radius, -radius, cols, rows, POUR_BONUS_MIN_PITCH);
	// The surface can be no lower than this for the box to fit beneath it
	const lowest = least.spare >= 0 ? least.top + least.spare - AMBER_CLEAR : -radius;
	const level = Math.max(-1, Math.min(levelForShare(bonus / score), lowest / radius));
	const surface = level * radius;
	let bonusPitch = pitch;
	if (roomUnder(radius, surface, cols, rows, pitch).spare < 0) {
		let lo = 0;
		let hi = pitch;
		for (let i = 0; i < 30; i++) {
			const mid = (lo + hi) / 2;
			if (roomUnder(radius, surface, cols, rows, mid).spare >= 0) lo = mid;
			else hi = mid;
		}
		bonusPitch = lo;
	}
	const { top, spare } = roomUnder(radius, surface, cols, rows, bonusPitch);
	const dots = layout.dots.map(({ col, row }) => ({
		x: (col + 0.5 - cols / 2) * bonusPitch,
		y: top + spare / 2 + (row + 0.5) * bonusPitch,
	}));
	return { level, label: { dots, pitch: bonusPitch } };
}

/**
 * How far the settled tally, `height` px tall, sits from the drop's centre over an amber
 * surface `surface` px below it: centred in the player's colour above it where that holds it,
 * otherwise just clear of the amber, out of the drop's top if need be
 */
function tallyLift(radius: number, surface: number, height: number): number {
	if (surface + radius >= height + 2 * AMBER_CLEAR) return (surface - radius) / 2;
	return surface - AMBER_CLEAR - height / 2;
}

/** Work out a run's pour */
export function planPour({ record, color, pitch }: PourInput): PourPlan {
	const { catches } = record;
	const seconds = runSeconds(record.ticks);
	const spanMs = spanOf(seconds);
	const times = landTimes(
		catches.map((c) => c.tick),
		spanMs,
	);
	const drops = dropsOf(record, color);
	const cues = catches.map((c) => ({ pitch: catchPitch(c.step), point: c.point }));
	const sounding = soundingOf(cues, times);
	const settledDrop = drops[drops.length - 1];
	const { radius, tally: score } = settledDrop;
	const bonus = comboBonus(record);
	const amber = bonus > 0 ? amberOf(bonus, score, radius, pitch) : null;
	const tallyHeight = layoutDotMatrix(String(score)).rows * pitch;
	const { bodies, spots } = bodiesOf(catches, times, drops);
	return {
		catches: catches.map((_, i) => ({
			...cues[i],
			...spots[i],
			landMs: times[i],
			heard: sounding[i],
		})),
		bodies,
		drops,
		settledDrop,
		digits: drops.map((drop) => digitsOf(drop, pitch)),
		seconds,
		spanMs,
		settleMs: POUR_START_MS + spanMs + POUR_SETTLE_MS,
		level: amber?.level ?? 1,
		lift: amber ? tallyLift(radius, amber.level * radius, tallyHeight) : 0,
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
 * How far the clock has run up at `ms`, 0..1: all the way from the end of a span of `spanMs`
 * on, exactly, as the time to it rounds
 */
function clockShare(spanMs: number, ms: number): number {
	"worklet";
	const end = POUR_START_MS + spanMs;
	return ms >= end ? 1 : clamp01((ms - POUR_START_MS) / spanMs);
}

/** The pour at `ms` since the game over appeared, with the landings since `sinceMs` */
export function pourAt(plan: PourPlan, ms: number, sinceMs = ms): PourView {
	"worklet";
	const landings: PourLanding[] = [];
	const sounds: PourSound[] = [];
	const flights: PourFlight[] = [];
	let landed = 0;
	for (const c of plan.catches) {
		if (c.landMs <= ms) landed++;
		if (c.landMs > sinceMs && c.landMs <= ms) {
			landings.push({ x: c.x, y: c.y, point: c.point });
			if (c.heard) sounds.push({ pitch: c.pitch, point: c.point });
		}
	}
	for (const b of plan.bodies) {
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
	const drop = plan.drops[landed];
	const settled = ms >= plan.settleMs;
	// The amber's surface and the tally above it rise together, easing in and out
	const t = clamp01((ms - plan.settleMs) / POUR_RISE_MS);
	const risen = t * t * (3 - 2 * t);
	const amberLevel = 1 + (plan.level - 1) * risen;
	const lift = plan.lift * risen;
	let digits = plan.digits[landed];
	if (lift !== 0) {
		const lifted: PourDigitDot[] = [];
		for (const { x, y } of digits) {
			lifted.push({ x, y: y + lift, ink: Math.hypot(x, y + lift) < drop.radius });
		}
		digits = lifted;
	}
	const { bonusLabel } = plan;
	return {
		landings,
		sounds,
		flights,
		drop,
		digits,
		clock: formatClock(plan.seconds * clockShare(plan.spanMs, ms)),
		amberLevel: amberLevel < 1 ? amberLevel : null,
		bonusLabel: bonusLabel && {
			dots: bonusLabel.dots,
			pitch: bonusLabel.pitch,
			opacity: clamp01((ms - plan.settleMs - POUR_RISE_MS) / POUR_FADE_MS),
		},
		settled,
	};
}
