import { GAME_HERTZ } from "../domain/constants";
import { BenchSpawner } from "../domain/engine/BenchSpawner";
import { seededRandom } from "../domain/random";
import type { GameSessionOptions } from "./GameSession";
import type { SensorSample } from "./ports";

/**
 * The bench run: a late run played by itself, the same every time, so performance traces of
 * play can be compared build against build (see scripts/android-perf-trace.sh). A bench build
 * starts it on launch; a shipped build never does.
 *
 * Small dots arrive at the rate of a run BENCH_AHEAD_MINUTES in and hold at BENCH_DOTS once
 * that many are in play; dots of another colour pass over the player instead of ending the
 * run; and the player is steered along BENCH_TILT's path instead of by the phone.
 */

/** How far into a run the spawning starts */
const BENCH_AHEAD_MINUTES = 20;
/** Small and point dots held in play once the screen has filled */
const BENCH_DOTS = 60;
const BENCH_SEED = 2026;

/** The session options that make a run the bench run */
export function benchSessionOptions(): Pick<GameSessionOptions, "random" | "spawner" | "refusals"> {
	return {
		random: seededRandom(BENCH_SEED),
		spawner: new BenchSpawner(
			seededRandom(BENCH_SEED + 1),
			BENCH_AHEAD_MINUTES * 60 * GAME_HERTZ,
			BENCH_DOTS,
		),
		refusals: false,
	};
}

/** Peak tilt (radians) of the bench path: a brisk roll, into the walls and back */
const TILT_AMPLITUDE = 0.14;
/** Seconds for one sweep across and one up and down; unequal, so the path covers the screen */
const PERIOD_X_S = 6.1;
const PERIOD_Y_S = 4.3;

/** The tilt the bench run steers with, `seconds` after it starts */
export function benchTilt(seconds: number): SensorSample {
	return {
		x: TILT_AMPLITUDE * Math.sin((2 * Math.PI * seconds) / PERIOD_X_S),
		y: TILT_AMPLITUDE * Math.sin((2 * Math.PI * seconds) / PERIOD_Y_S),
		facingDown: false,
	};
}
