/**
 * An effect lane: something animated on the UI thread by a frame clock that runs only while
 * anything in it moves, such as the stage bursts (see burstFrames.ts). The lane owns the
 * protocol that starts and stops the clock safely; what moves, and how, is its reducer's.
 *
 *   add     On the JS thread: hand out the next id, make the item under it, append it on the
 *           UI thread (noting the id there as the newest seen) and switch the clock on.
 *   step    On the UI thread, each frame: advance the state to the frame time, publish the
 *           time, and once the reducer says it is idle, ask the JS thread to stop the clock,
 *           passing the newest id the UI thread had seen.
 *   stop    On the JS thread: switch the clock off only if no newer id was handed out since.
 *           A stop sent before a newer item reached the UI thread is for an older one, and
 *           taking it would leave the newer item frozen on its first frame.
 *   freeze  On the JS thread: stand the lane's time still, as a paused run stands its field
 *           still. The next step takes it and stops the clock; a thaw switches the clock back
 *           on, and its first step picks the time up where it stood, the frozen gap left out,
 *           so the reducer never sees the pause.
 *
 * The ids are kept here, outside any hook: the React Compiler once compiled `ref.current++` in
 * a hook as a pre-increment, so every item got the id one past the newest the stop was checked
 * against, and pops were left frozen on the board.
 *
 * The state need not be a list: the newest id seen is noted as the item is added, not read
 * back from the state.
 */

/** How a lane's state takes an item, moves on to a frame time, and when nothing in it moves */
export interface EffectReducer<S, T> {
	/** `state` with `item` in it; runs on the UI thread */
	add(state: S, item: T): S;
	/** `state` at frame time `now`; may return `state` itself, changed in place or not at all */
	advance(state: S, now: number): S;
	/** Whether nothing in `state` moves any more at `now`, so the clock can stop */
	idle(state: S, now: number): boolean;
}

/** A value held on the UI thread and read there, by the lane and by drawing: a shared value */
interface LaneCell<V> {
	get(): V;
	set(value: V): void;
	/** Update the value on the UI thread, from either thread */
	modify(update: (value: V) => V): void;
}

/**
 * Whether the lane's time stands still, whether a thaw waits for the next step, and how far
 * the lane's time lags the frame clock's for the time it stood
 */
export interface LaneFreeze {
	frozen: boolean;
	thawing: boolean;
	lag: number;
}

export const RUNNING_LANE: LaneFreeze = { frozen: false, thawing: false, lag: 0 };

/** What a lane touches outside itself; in the app, shared values, a frame callback and scheduleOnRN */
export interface LanePorts<S> {
	/** The lane's state, as drawing reads it */
	state: LaneCell<S>;
	/** The newest id the UI thread has seen; starts at -1 */
	seen: LaneCell<number>;
	/** The lane's time at the latest frame, which drawing reads the state at */
	time: LaneCell<number>;
	/** Whether the lane's time stands still (see LaneFreeze); starts as RUNNING_LANE */
	freeze: LaneCell<LaneFreeze>;
	/** The frame clock that runs `step`, switched on and off from the JS thread */
	clock: { setActive(active: boolean): void };
	/** Run `call` with `seen` on the JS thread, from the UI thread */
	toJS: (call: (seen: number) => void, seen: number) => void;
}

export interface EffectLane<T> {
	/** Add the item `make` builds under the lane's next id (JS thread) */
	add(make: (id: number) => T): void;
	/** Stand the lane's time still, or let it run on from where it stood (JS thread) */
	setFrozen(frozen: boolean): void;
	/** The frame clock's callback (a worklet) */
	step(frame: { timestamp: number }): void;
	/**
	 * Switch the clock off and drop any stop still on its way to the JS thread, e.g. when the
	 * screen goes away. A later add runs the lane again, as after a Fast Refresh re-runs effects.
	 */
	dispose(): void;
}

export function createEffectLane<S, T>(
	reducer: EffectReducer<S, T>,
	{ state, seen, time, freeze, clock, toJS }: LanePorts<S>,
): EffectLane<T> {
	let next = 0;
	let open = true;
	// Whether the JS thread last asked for a freeze; the UI thread takes it at its next step
	let asked = false;
	const stop = (seenId: number) => {
		if (open && seenId === next - 1) clock.setActive(false);
	};
	return {
		add(make) {
			open = true;
			const id = next;
			next = id + 1;
			const item = make(id);
			state.modify((current) => {
				"worklet";
				seen.set(id);
				return reducer.add(current, item);
			});
			clock.setActive(true);
		},
		setFrozen(frozen) {
			if (frozen === asked) return;
			asked = frozen;
			freeze.modify((current) => {
				"worklet";
				return { frozen, thawing: !frozen, lag: current.lag };
			});
			// A thaw needs a step to take it; a freeze is taken by the next step there is
			if (!frozen && open) clock.setActive(true);
		},
		step(frame) {
			"worklet";
			let { frozen, thawing, lag } = freeze.get();
			if (frozen) {
				toJS(stop, seen.get());
				return;
			}
			if (thawing) {
				lag = frame.timestamp - time.get();
				freeze.set({ frozen, thawing: false, lag });
			}
			const now = frame.timestamp - lag;
			const current = state.get();
			const advanced = reducer.advance(current, now);
			if (advanced !== current) state.set(advanced);
			time.set(now);
			if (reducer.idle(advanced, now)) toJS(stop, seen.get());
		},
		dispose() {
			open = false;
			clock.setActive(false);
		},
	};
}
