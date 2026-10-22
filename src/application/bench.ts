import { DOT_LIMIT, GAME_HERTZ } from "../domain/constants";
import { BenchSpawner } from "../domain/engine/BenchSpawner";
import { FLAT_UP, gravityAt } from "../domain/levelPose";
import { seededRandom } from "../domain/random";
import type { GameSessionOptions } from "./GameSession";
import type { SensorSample } from "./ports";

/**
 * The bench run: a late run played by itself, the same every time, so performance traces of
 * play can be compared build against build (see scripts/android-perf-trace.sh). A bench build
 * starts it on launch; a shipped build never does.
 *
 * Small dots arrive at the rate of a run some minutes in and hold at a number of dots once
 * that many are in play (see BENCH_RUNS); dots of another colour pass over the player instead
 * of ending the run; and the player is steered along BENCH_TILT's path instead of by the phone.
 */

/**
 * The bench runs. "steady" holds 60 dots, so a drip only forms on a wall after a catch and
 * most frames have none. "drips" keeps the dots coming, as real play does, so a drip is
 * forming on a wall in every frame; it measures how the walls' drips draw, at a load that
 * grows past steady's to about 80 dots while traced.
 */
export type BenchRun = "steady" | "drips";

const BENCH_RUNS: Record<BenchRun, { aheadMinutes: number; dots: number }> = {
	steady: { aheadMinutes: 20, dots: 60 },
	drips: { aheadMinutes: 10, dots: DOT_LIMIT },
};
const BENCH_SEED = 2026;

/** The session options that make a run the bench run */
export function benchSessionOptions(
	run: BenchRun = "steady",
): Pick<GameSessionOptions, "random" | "spawner" | "refusals"> {
	const { aheadMinutes, dots } = BENCH_RUNS[run];
	return {
		random: seededRandom(BENCH_SEED),
		spawner: new BenchSpawner(seededRandom(BENCH_SEED + 1), aheadMinutes * 60 * GAME_HERTZ, dots),
		refusals: false,
	};
}

/** Peak tilt (radians) of the bench path: a brisk roll, into the walls and back */
const TILT_AMPLITUDE = 0.14;
/** Seconds for one sweep across and one up and down; unequal, so the path covers the screen */
const PERIOD_X_S = 6.1;
const PERIOD_Y_S = 4.3;

/** The reading the bench run steers with, `seconds` after it starts: tilted from flat */
export function benchTilt(seconds: number): SensorSample {
	const tilt = {
		x: TILT_AMPLITUDE * Math.sin((2 * Math.PI * seconds) / PERIOD_X_S),
		y: TILT_AMPLITUDE * Math.sin((2 * Math.PI * seconds) / PERIOD_Y_S),
	};
	return gravityAt(tilt, FLAT_UP);
}
