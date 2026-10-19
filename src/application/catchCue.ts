/**
 * How a catch is heard and seen beyond its score: the sound climbs with the combo, and catches
 * that land on the same tick are spread out so each is heard and seen on its own.
 */

/** The catch sound climbs no higher than this many semitones */
const MAX_CATCH_PITCH = 12;

/** How far apart (ms) the cues of catches that landed on the same tick are spread */
export const CATCH_STAGGER_MS = 80;

/** Semitones a catch's sound is raised: one per combo step after the first, up to an octave */
export function catchPitch(step: number): number {
	return Math.min(MAX_CATCH_PITCH, Math.max(0, step - 1));
}

/** Cues each catch in turn, spread out where they landed on the same tick */
export interface CatchStagger {
	/** Cue `run`, given whether its catch landed on the same tick as the catch before */
	cue(sameTick: boolean, run: () => void): void;
	/** Cancel every cue still waiting, e.g. when the screen or binding goes away */
	dispose(): void;
}

/**
 * Cue each catch's sound or pop, given whether it landed on the same tick as the catch before:
 * right away, or through `schedule` when it has to wait. A same-tick catch comes
 * CATCH_STAGGER_MS after the one before, and nothing cued comes before a cue still waiting,
 * so what follows the catches (a combo's total, the run's end) can go through here too.
 * `schedule` answers with a cancel, which dispose calls for every cue still waiting.
 */
export function createCatchStagger(
	schedule: (cue: () => void, ms: number) => () => void = (cue, ms) => {
		const timer = setTimeout(cue, ms);
		return () => clearTimeout(timer);
	},
	now: () => number = Date.now,
): CatchStagger {
	let lastAt = Number.NEGATIVE_INFINITY;
	// The cancel of each cue still waiting, by what its timer runs
	const waiting = new Map<() => void, () => void>();
	const cue = (sameTick: boolean, run: () => void) => {
		const time = now();
		const at = Math.max(time, lastAt + (sameTick ? CATCH_STAGGER_MS : 0));
		lastAt = at;
		if (at === time) {
			run();
			return;
		}
		const held = () => {
			waiting.delete(held);
			run();
		};
		waiting.set(held, schedule(held, at - time));
	};
	const dispose = () => {
		for (const cancel of waiting.values()) cancel();
		waiting.clear();
	};
	return { cue, dispose };
}
