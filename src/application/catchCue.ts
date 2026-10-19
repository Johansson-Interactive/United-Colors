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

/** Cues each catch, given whether it landed on the same tick as the catch before */
export interface CatchStagger {
	(sameTick: boolean, cue: () => void): void;
	/** Drop every cue still waiting, e.g. when the screen or binding goes away */
	dispose(): void;
}

/**
 * Cue each catch's sound or pop, given whether it landed on the same tick as the catch before:
 * right away, or through `schedule` when it has to wait. A same-tick catch comes
 * CATCH_STAGGER_MS after the one before, and no catch comes before one still waiting.
 */
export function createCatchStagger(
	schedule: (cue: () => void, ms: number) => void = (cue, ms) => setTimeout(cue, ms),
	now: () => number = Date.now,
): CatchStagger {
	let lastAt = Number.NEGATIVE_INFINITY;
	const waiting = new Set<() => void>();
	const stagger = (sameTick: boolean, cue: () => void) => {
		const time = now();
		const at = Math.max(time, lastAt + (sameTick ? CATCH_STAGGER_MS : 0));
		lastAt = at;
		if (at === time) {
			cue();
			return;
		}
		const run = () => {
			if (waiting.delete(run)) cue();
		};
		waiting.add(run);
		schedule(run, at - time);
	};
	return Object.assign(stagger, { dispose: () => waiting.clear() });
}
