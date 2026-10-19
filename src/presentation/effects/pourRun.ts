/**
 * Pure stepper behind the game over's pour: the run replayed as its catches falling in, in the
 * order and rhythm they happened, and merging into one drop of the player's liquid, while a
 * clock runs up to the run time. Every run pours in the same span (POUR_SPAN_MS), whatever its
 * length; once it settles, the combo bonus shows as an amber share of the drop and a `+N`.
 *
 * planPour works a run's pour out once, on the JS thread; pourAt then samples it at a replay
 * time (ms since the game over appeared) as a plain view of everything the shell draws. pourAt
 * is a worklet and a pure function of time, so the shell samples it per frame from its own
 * clock. Pass it the previous sample's time too, and it lists the catches that landed in
 * between, each exactly once, for their bursts, and the sounds among them. The shell owns the
 * drawing, the jelly kicked on each landing, the sounds and where things are on the screen.
 */

import { catchPitch } from "../../application/catchCue";
import { MERGE_MAX_DOTS } from "../../application/renderScene";
import { comboBonus, runSeconds } from "../../domain/run";
import type { RunCatch, RunRecord } from "../../domain/types";
import { layoutDotMatrix } from "../dotmatrix/layout";
import { type Burst, layOutBurst } from "./burstFrames";
import { NO_CATCH_SPOT, stepBursts } from "./stageBursts";

/** The first catch lands this long after the game over appears (ms) */
export const POUR_START_MS = 500;
/** From the first catch's landing to the last, and the clock's run up, whatever the run (ms) */
export const POUR_SPAN_MS = 2200;
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

/**
 * The drop's area follows the tally: its radius is this many px per root of the tally. A small
 * catch falls at this radius, a drop of one
 */
export const POUR_DOT_RADIUS = 9;
/** ...up to this radius (px), reached at a tally of about 200, so any score fits the screen */
export const POUR_MAX_RADIUS = 130;
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

/** One catch's landing: where, its sound, whether or not it is heard, and its bursts */
interface PourLanding extends PourSpot, PourSound {
	/**
	 * Its bursts on the drop's top, as it burst in play (see stageBursts): a combo catch pops
	 * in combo amber and a point dot pops and rings in its colour; a lone small dot is quiet
	 */
	bursts: readonly Burst[];
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

interface PlannedCatch extends PourLanding {
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
	settleMs: number;
	/** The combo bonus's share of the score, and its label; 0 and null without one */
	amber: number;
	bonusLabel: string | null;
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
	/** The tally's dots */
	digits: readonly PourDigitDot[];
	/** The clock: run time so far as `M:SS`, rounded down */
	clock: string;
	/** The combo bonus's share of the drop's area, drawn amber at its bottom; 0 until settled */
	amber: number;
	/** `+N` beside the amber layer; null until settled and without a combo bonus */
	bonusLabel: string | null;
	/** The drop is at rest: `NEW BEST!` and confetti may follow */
	settled: boolean;
}

/**
 * When each catch lands: its run tick mapped onto the span, the first at its start and the
 * last at its end (all at the end when they share one tick), so the run keeps its rhythm
 */
function landTimes(ticks: readonly number[]): number[] {
	const first = ticks[0];
	const runSpan = ticks[ticks.length - 1] - first;
	const end = POUR_START_MS + POUR_SPAN_MS;
	return ticks.map((tick) =>
		runSpan > 0 ? POUR_START_MS + (POUR_SPAN_MS * (tick - first)) / runSpan : end,
	);
}

/**
 * The bodies the catches landing at `times` on `spots` fall in, at least POUR_STAGGER_MS
 * apart; each falls onto its first catch's spot
 */
function bodiesOf(
	catches: readonly RunCatch[],
	times: readonly number[],
	spots: readonly PourSpot[],
): PlannedBody[] {
	const bodies: PlannedBody[] = [];
	for (let i = 0; i < catches.length; ) {
		const landMs = times[i];
		let look = catches[i];
		let next = i + 1;
		for (; next < catches.length && times[next] < landMs + POUR_STAGGER_MS; next++) {
			if (catches[next].point && !look.point) look = catches[next];
		}
		bodies.push({ color: look.color, landMs, x: spots[i].x, y: spots[i].y });
		i = next;
	}
	return bodies;
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
 * A catch's bursts on the spot it lands on, laid out under ids from `firstId` on: those it
 * showed in play, if it was a combo catch or a point dot
 */
function landingBursts(c: RunCatch, spot: PourSpot, firstId: number): Burst[] {
	if (c.step === 1 && !c.point) return [];
	const event = {
		type: c.point ? ("collectPoint" as const) : ("collect" as const),
		value: c.value,
		step: c.step,
		sameTick: false,
	};
	const player = { x: spot.x, y: spot.y, color: c.color };
	return stepBursts(NO_CATCH_SPOT, event, player).bursts.map((b, i) => layOutBurst(firstId + i, b));
}

/** Work out a run's pour */
export function planPour({ record, color, pitch }: PourInput): PourPlan {
	const { catches } = record;
	const times = landTimes(catches.map((c) => c.tick));
	const drops = dropsOf(record, color);
	const cues = catches.map((c) => ({ pitch: catchPitch(c.step), point: c.point }));
	const sounding = soundingOf(cues, times);
	const settledDrop = drops[drops.length - 1];
	const score = settledDrop.tally;
	const bonus = comboBonus(record);
	const spots = catches.map((_, i) => landingSpot(i, drops[i].radius));
	let burstId = 0;
	return {
		catches: catches.map((c, i) => {
			const bursts = landingBursts(c, spots[i], burstId);
			burstId += bursts.length;
			return { ...cues[i], ...spots[i], landMs: times[i], bursts, heard: sounding[i] };
		}),
		bodies: bodiesOf(catches, times, spots),
		drops,
		settledDrop,
		digits: drops.map((drop) => digitsOf(drop, pitch)),
		seconds: runSeconds(record.ticks),
		settleMs: POUR_START_MS + POUR_SPAN_MS + POUR_SETTLE_MS,
		amber: bonus > 0 ? bonus / score : 0,
		bonusLabel: bonus > 0 ? `+${bonus}` : null,
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
			landings.push({ x: c.x, y: c.y, pitch: c.pitch, point: c.point, bursts: c.bursts });
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
	return {
		landings,
		sounds,
		flights,
		drop,
		digits: plan.digits[landed],
		clock: formatClock(plan.seconds * clamp01((ms - POUR_START_MS) / POUR_SPAN_MS)),
		amber: settled ? plan.amber : 0,
		bonusLabel: settled ? plan.bonusLabel : null,
		settled,
	};
}
