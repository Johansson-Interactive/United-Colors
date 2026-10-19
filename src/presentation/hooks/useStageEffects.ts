import { useCallback, useEffect, useRef, useState } from "react";
import {
	type FrameCallback,
	type FrameInfo,
	useFrameCallback,
	useSharedValue,
	withDelay,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { createCatchStagger } from "../../application/catchCue";
import type { GameStore } from "../../application/GameStore";
import { onGameEvents } from "../../application/gameEvents";
import type { GamePhase } from "../../domain/types";
import {
	advanceBursts,
	type Burst,
	burstColor,
	comboTotalBurst,
	createBurstIds,
	popBurst,
	ringBurst,
	withBurst,
} from "../effects/burstFrames";
import { INITIAL_BURST_MEMORY, type NewBurst, SHAKE, stepBursts } from "../effects/stageBursts";
import { INK_LIFT } from "../theme/theme";
import { createTimeoutGroup } from "./timeoutGroup";

/**
 * Presentation-only reactions to what the game does: the edge wash takes the player's
 * colour, the scene frosts when still, the final hit shakes the stage, and score changes
 * burst where the player is. Reads the store; never writes to it.
 *
 * The bursts never go through React: each is laid out here once and appended to a list on
 * the UI thread, which the game canvas draws at `burstClock`, the frame time (see
 * burstFrames.ts). The clock runs only while a burst is alive.
 */
export function useStageEffects(store: GameStore, phase: GamePhase, playerColor: string) {
	// Memoised by hand, not by the React Compiler: it reads the frame callback's worklet factory
	// as a call that may change the shared values, so it rebuilt the callback on every render
	// and dropped the useCallback around it, and useFrameCallback re-registers on each new one
	"use no memo";
	const accent = useSharedValue<string>(INK_LIFT);
	const frost = useSharedValue(0);
	const shake = useSharedValue(0);
	const bursts = useSharedValue<Burst[]>([]);
	const burstClock = useSharedValue(0);
	/** The newest burst the UI thread has drawn, so a stop sent before a newer one is ignored */
	const burstSeen = useSharedValue(-1);
	const [burstIds] = useState(createBurstIds);

	// Frost the scene when it is still; wash the edges in the player's colour when playing
	useEffect(() => {
		if (phase === "PAUSED") {
			frost.set(withTiming(1, { duration: 450 }));
		} else if (phase === "GAME_OVER") {
			frost.set(withDelay(350, withTiming(0.6, { duration: 700 })));
		} else {
			frost.set(withTiming(0, { duration: 300 }));
		}
	}, [phase, frost]);

	useEffect(() => {
		accent.set(phase === "KIOSK" ? INK_LIFT : playerColor);
	}, [phase, playerColor, accent]);

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

	// Staggered pops still waiting, cleared on unmount so none fire into a dead screen
	const [burstTimers] = useState(createTimeoutGroup);
	useEffect(() => () => burstTimers.clearAll(), [burstTimers]);

	const addBurst = useCallback(
		(make: (id: number) => Burst) => {
			const burst = make(burstIds.take());
			bursts.modify((list) => {
				"worklet";
				return withBurst(list, burst);
			});
			clock.setActive(true);
		},
		[bursts, clock, burstIds],
	);

	// Bursts as the game reports what happened (see stageBursts). The frame's player dot is at its
	// live position: the frame was published by the very move that scored.
	useEffect(() => {
		const stagger = createCatchStagger(burstTimers.schedule);
		let memory = INITIAL_BURST_MEMORY;
		return onGameEvents(store, (event, frame) => {
			const player = frame.dots.find((d) => d.kind === "player");
			if (!player) return;
			const step = stepBursts(memory, event, player);
			memory = step.memory;
			const show = () => {
				for (const burst of step.bursts) addBurst((id) => layOutBurst(id, burst));
				if (step.shake) {
					shake.set(withSequence(...SHAKE.map(({ to, ms }) => withTiming(to, { duration: ms }))));
				}
			};
			if (step.catchCue) stagger(step.catchCue.sameTick, show);
			else show();
		});
	}, [store, addBurst, shake, burstTimers]);

	return { accent, frost, shake, bursts, burstClock };
}

/** A burst from the stepper, laid out for the UI thread under `id` */
function layOutBurst(id: number, burst: NewBurst): Burst {
	const color = burstColor(burst.color);
	switch (burst.kind) {
		case "pop":
			return popBurst(id, burst.x, burst.y, burst.text, color);
		case "comboTotal":
			return comboTotalBurst(id, burst.x, burst.y, burst.text, color);
		case "ring":
			return ringBurst(id, burst.x, burst.y, color, burst.size);
	}
}
