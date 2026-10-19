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
 * between, each exactly once, for their sound and burst. The shell owns the drawing, the
 * jelly kicked on each landing, the sounds and where things are on the screen.
 */

import { catchPitch } from "../../application/catchCue";
import { MERGE_MAX_DOTS } from "../../application/renderScene";
import { comboBonus, runSeconds } from "../../domain/run";
import type { RunRecord } from "../../domain/types";
import { layoutDotMatrix } from "../dotmatrix/layout";

/** The first catch lands this long after the game over appears (ms) */
export const POUR_START_MS = 500;
/** From the first catch's landing to the last, and the clock's run up, whatever the run (ms) */
export const POUR_SPAN_MS = 2200;
/** A catch falls this long before it lands (ms), then merges into the drop for MERGE_MS */
export const POUR_FALL_MS = 420;
const MERGE_MS = 260;
/**
 * Catches land at least this far apart (ms), about five frames, so that no more than
 * MERGE_MAX_DOTS are falling or merging at once: a millisecond over the share of that limit,
 * so one catch's merge is over before the catch MERGE_MAX_DOTS after it starts falling. A run
 * too dense for this over the span pours faster instead, falls, merges and stagger alike.
 */
export const POUR_STAGGER_MS = Math.ceil((POUR_FALL_MS + MERGE_MS) / MERGE_MAX_DOTS) + 1;
/** The drop comes to rest this long after the last landing (ms); then the pour is settled */
export const POUR_SETTLE_MS = 700;

/**
 * The drop's area follows the tally: its radius is this many px per root of the tally. A small
 * catch falls at this radius, a drop of one
 */
export const POUR_DOT_RADIUS = 9;
/** ...up to this radius (px), reached at a tally of about 200, so any score fits the screen */
export const POUR_MAX_RADIUS = 130;

export interface PourInput {
	record: RunRecord;
	/** The personal best before this run */
	best: number;
	/** The player's final colour */
	color: string;
	/** Centre-to-centre spacing of the tally's dots (px) */
	pitch: number;
}

/** One catch's landing: the sound to cue for it and whether it bursts */
interface PourLanding {
	/** Semitones the catch sound is raised (see catchPitch) */
	pitch: number;
	/** A point dot: the large catch sound */
	point: boolean;
	/** A combo catch (step above 1): bursts in combo amber */
	combo: boolean;
}

/** A catch on its way into the drop */
export interface PourFlight {
	color: string;
	/** A point dot, drawn at its size; otherwise a small dot */
	point: boolean;
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
	color: string;
	landMs: number;
}

/** A run's pour, worked out once; sample it with pourAt */
export interface PourPlan {
	catches: readonly PlannedCatch[];
	/** The drop and its tally's dots once `k` catches have landed, by `k` */
	drops: readonly PourDrop[];
	digits: readonly (readonly PourDigitDot[])[];
	/** How long each catch falls and merges: shortened on a run too dense for the span */
	fallMs: number;
	mergeMs: number;
	/** The run time (s), which the clock reaches at the last landing */
	seconds: number;
	settleMs: number;
	best: number;
	/** The combo bonus's share of the score, and its label; 0 and null without one */
	amber: number;
	bonusLabel: string | null;
}

/** What the shell draws at one moment of the pour */
export interface PourView {
	/** Catches that landed after the previous sample, up to this one, in order */
	landings: PourLanding[];
	/** Catches falling or merging, in landing order; never more than MERGE_MAX_DOTS */
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
	/** The `best N` caption: out once the tally has passed the old best */
	bestShown: boolean;
	/** The drop is at rest: `NEW BEST!` and confetti may follow */
	settled: boolean;
}

/**
 * When each catch lands: its run tick mapped onto the span, the first at its start and the
 * last at its end (all at the end when they share one tick), then pulled apart to `gap`.
 * Late catches are moved earlier, never past the end, so the last still lands with the clock.
 */
function landTimes(ticks: readonly number[], gap: number): number[] {
	const first = ticks[0];
	const runSpan = ticks[ticks.length - 1] - first;
	const end = POUR_START_MS + POUR_SPAN_MS;
	const times = ticks.map((tick) =>
		runSpan > 0 ? POUR_START_MS + (POUR_SPAN_MS * (tick - first)) / runSpan : end,
	);
	for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i], times[i - 1] + gap);
	times[times.length - 1] = Math.min(times[times.length - 1], end);
	for (let i = times.length - 2; i >= 0; i--) times[i] = Math.min(times[i], times[i + 1] - gap);
	return times;
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

/** Work out a run's pour */
export function planPour({ record, best, color, pitch }: PourInput): PourPlan {
	const { catches } = record;
	const pace = Math.min(1, POUR_SPAN_MS / (Math.max(1, catches.length - 1) * POUR_STAGGER_MS));
	const times = landTimes(
		catches.map((c) => c.tick),
		POUR_STAGGER_MS * pace,
	);
	const drops = dropsOf(record, color);
	const score = drops[drops.length - 1].tally;
	const bonus = comboBonus(record);
	return {
		catches: catches.map((c, i) => ({
			landMs: times[i],
			color: c.color,
			pitch: catchPitch(c.step),
			point: c.point,
			combo: c.step > 1,
		})),
		drops,
		digits: drops.map((drop) => digitsOf(drop, pitch)),
		fallMs: POUR_FALL_MS * pace,
		mergeMs: MERGE_MS * pace,
		seconds: runSeconds(record.ticks),
		settleMs: POUR_START_MS + POUR_SPAN_MS + POUR_SETTLE_MS,
		best,
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
	const { fallMs, mergeMs } = plan;
	const landings: PourLanding[] = [];
	const flights: PourFlight[] = [];
	let landed = 0;
	for (const c of plan.catches) {
		if (c.landMs <= ms) landed++;
		if (c.landMs > sinceMs && c.landMs <= ms) {
			landings.push({ pitch: c.pitch, point: c.point, combo: c.combo });
		}
		if (ms >= c.landMs - fallMs && ms < c.landMs + mergeMs) {
			flights.push({
				color: c.color,
				point: c.point,
				fall: clamp01((ms - c.landMs + fallMs) / fallMs),
				merge: clamp01((ms - c.landMs) / mergeMs),
			});
		}
	}
	const drop = plan.drops[landed];
	const settled = ms >= plan.settleMs;
	return {
		landings,
		flights,
		drop,
		digits: plan.digits[landed],
		clock: formatClock(plan.seconds * clamp01((ms - POUR_START_MS) / POUR_SPAN_MS)),
		amber: settled ? plan.amber : 0,
		bonusLabel: settled ? plan.bonusLabel : null,
		// The tally only grows, so once past the best it stays past it
		bestShown: drop.tally <= plan.best,
		settled,
	};
}
