import { useCallback, useEffect, useRef, useState } from "react";
import {
	type FrameCallback,
	type FrameInfo,
	useFrameCallback,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { createCatchStagger } from "../../application/catchCue";
import type { GameStore } from "../../application/GameStore";
import { onGameEvents } from "../../application/gameEvents";
import {
	advanceBursts,
	type Burst,
	createBurstIds,
	layOutBurst,
	type NewBurst,
	withBurst,
} from "../effects/burstFrames";
import { NO_CATCH_SPOT, SHAKE, stepBursts } from "../effects/stageBursts";

/**
 * Presentation-only reactions to what the game does: the refusal that ends a run shakes the
 * stage, and score changes burst where the player is. Reads the store; never writes to it.
 * How the field looks behind each screen, frosted or clear and the edges' wash, is the stage
 * look's (see stageLook.ts).
 *
 * The bursts never go through React: each is laid out here once and appended to a list on
 * the UI thread, which the game canvas draws at `burstClock`, the frame time (see
 * burstFrames.ts). The clock runs only while a burst is alive.
 */
export function useStageEffects(store: GameStore) {
	// Memoised by hand, not by the React Compiler: it reads the frame callback's worklet factory
	// as a call that may change the shared values, so it rebuilt the callback on every render
	// and dropped the useCallback around it, and useFrameCallback re-registers on each new one
	"use no memo";
	const shake = useSharedValue(0);
	const bursts = useSharedValue<Burst[]>([]);
	const burstClock = useSharedValue(0);
	/** The newest burst the UI thread has drawn, so a stop sent before a newer one is ignored */
	const burstSeen = useSharedValue(-1);
	const [burstIds] = useState(createBurstIds);

	// Stops the clock once the UI thread has no burst left, unless one was added since
	const clockRef = useRef<FrameCallback | null>(null);
	const stopClock = useCallback(
		(seen: number) => {
			if (burstIds.isNewest(seen)) clockRef.current?.setActive(false);
		},
		[burstIds],
	);

	// Stamps, ages and drops the bursts each frame while any is alive
	const onFrame = useCallback(
		(frame: FrameInfo) => {
			"worklet";
			const list = bursts.get();
			for (let i = 0; i < list.length; i++) {
				if (list[i].id > burstSeen.get()) burstSeen.set(list[i].id);
			}
			const next = advanceBursts(list, frame.timestamp);
			if (next !== list) bursts.set(next);
			burstClock.set(frame.timestamp);
			if (next.length === 0) scheduleOnRN(stopClock, burstSeen.get());
		},
		[bursts, burstSeen, burstClock, stopClock],
	);
	const clock = useFrameCallback(onFrame, false);
	useEffect(() => {
		clockRef.current = clock;
	}, [clock]);

	const addBurst = useCallback(
		(newBurst: NewBurst) => {
			const burst = layOutBurst(burstIds.take(), newBurst);
			bursts.modify((list) => {
				"worklet";
				return withBurst(list, burst);
			});
			clock.setActive(true);
		},
		[bursts, clock, burstIds],
	);

	// Bursts as the game reports what happened (see stageBursts). The frame's player dot is at its
	// live position: the frame was published by the very move that scored. Steps still waiting on
	// the stagger are dropped on unmount, so none fire into a dead screen.
	useEffect(() => {
		const stagger = createCatchStagger();
		let catchSpot = NO_CATCH_SPOT;
		const unsubscribe = onGameEvents(store, (event, frame) => {
			const player = frame.dots.find((d) => d.kind === "player");
			if (!player) return;
			const step = stepBursts(catchSpot, event, player);
			catchSpot = step.catchSpot;
			stagger.cue(step.sameTick, () => {
				for (const burst of step.bursts) addBurst(burst);
				if (step.shake) {
					shake.set(withSequence(...SHAKE.map(({ to, ms }) => withTiming(to, { duration: ms }))));
				}
			});
		});
		return () => {
			unsubscribe();
			stagger.dispose();
		};
	}, [store, addBurst, shake]);

	return { shake, bursts, burstClock };
}
