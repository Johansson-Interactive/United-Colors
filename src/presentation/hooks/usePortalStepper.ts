import { useLayoutEffect, useState } from "react";
import { type SharedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { Portal, PortalStep } from "../effects/portal";

/**
 * Runs the bloom's or Get ready's stepper (see bloom.ts, getReady.ts) on the UI thread, one step
 * a frame, and returns what the latest frame says to draw. The step it opens on is worked out as
 * this mounts, and its portal set before the first paint, so the first frame drawn is already
 * the stepper's. Each frame it drives `portal`, which the play side is cut to (see useStageLook),
 * and reports the step's end once, as it happens. A step that is over answers with the same
 * state, and then there is nothing new to copy.
 *
 * `advance` must be a worklet: it runs in the frame callback, reading the touch and the tilt there.
 */
export function usePortalStepper<S, F extends { portal: Portal }, E extends string>(
	open: () => PortalStep<S, F, E>,
	advance: (state: S, dt: number) => PortalStep<S, F, E>,
	portal: SharedValue<Portal>,
	onEnd: (end: E) => void,
): SharedValue<F> {
	const [first] = useState(open);
	const state = useSharedValue(first.state);
	const frame = useSharedValue(first.frame);
	useLayoutEffect(() => portal.set(first.frame.portal), [portal, first]);

	useFrameCallback((info) => {
		const prev = state.get();
		const next = advance(prev, info.timeSincePreviousFrame ?? 16);
		if (next.state === prev) return;
		state.set(next.state);
		frame.set(next.frame);
		portal.set(next.frame.portal);
		if (next.end !== null) scheduleOnRN(onEnd, next.end);
	});
	return frame;
}
