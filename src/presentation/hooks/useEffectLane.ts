import { useEffect, useState } from "react";
import {
	type FrameCallback,
	type SharedValue,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { createEffectLane, type EffectLane, type EffectReducer } from "../effects/effectLane";

/**
 * An effect lane (see effectLane.ts) on React's side: its state and frame time in shared values,
 * its step on a frame callback that starts off, its stops through the worklets scheduler. Only
 * wiring; the protocol is the lane's. `reducer` is read once, so it must be a module constant.
 */
export function useEffectLane<S, T>(
	reducer: EffectReducer<S, T>,
	initial: S,
): { items: SharedValue<S>; time: SharedValue<number>; add: EffectLane<T>["add"] } {
	// Memoised by hand, not by the React Compiler: it reads the frame callback's worklet factory
	// as a call that may change the shared values, so it rebuilt the callback on every render,
	// and useFrameCallback re-registers on each new one. The lane is made once instead, and its
	// step is the one callback the frame clock ever gets
	"use no memo";
	const items = useSharedValue(initial);
	const time = useSharedValue(0);
	const seen = useSharedValue(-1);
	// The frame callback is made from the lane's step, so the lane reaches it once it exists
	const [{ lane, bind }] = useState(() => {
		let frameCallback: FrameCallback | null = null;
		return {
			lane: createEffectLane<S, T>(reducer, {
				items,
				seen,
				time,
				clock: { setActive: (active) => frameCallback?.setActive(active) },
				toJS: scheduleOnRN,
			}),
			bind: (bound: FrameCallback) => {
				frameCallback = bound;
			},
		};
	});
	const clock = useFrameCallback(lane.step, false);
	useEffect(() => {
		bind(clock);
		return () => lane.dispose();
	}, [bind, clock, lane]);
	return { items, time, add: lane.add };
}
