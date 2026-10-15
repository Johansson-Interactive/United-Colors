import { useCallback, useEffect, useRef, useState } from "react";
import {
	type FrameCallback,
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
	popBurst,
	ringBurst,
	withBurst,
} from "../effects/burstFrames";
import { catchPop } from "../effects/catchPop";
import { INK_LIFT, WHITE } from "../theme/theme";
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
	const accent = useSharedValue<string>(INK_LIFT);
	const frost = useSharedValue(0);
	const shake = useSharedValue(0);
	const bursts = useSharedValue<Burst[]>([]);
	const burstClock = useSharedValue(0);
	/** The newest burst the UI thread has drawn, so a stop sent before a newer one is ignored */
	const burstSeen = useSharedValue(-1);
	const burstIdRef = useRef(0);

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
	const stopClock = useCallback((seen: number) => {
		if (seen === burstIdRef.current - 1) clockRef.current?.setActive(false);
	}, []);

	// Stamps, ages and drops the bursts each frame while any is alive
	const clock = useFrameCallback((frame) => {
		const list = bursts.get();
		for (let i = 0; i < list.length; i++) {
			if (list[i].id > burstSeen.get()) burstSeen.set(list[i].id);
		}
		const next = advanceBursts(list, frame.timestamp);
		if (next !== list) bursts.set(next);
		burstClock.set(frame.timestamp);
		if (next.length === 0) scheduleOnRN(stopClock, burstSeen.get());
	}, false);
	useEffect(() => {
		clockRef.current = clock;
	}, [clock]);

	// Staggered pops still waiting, cleared on unmount so none fire into a dead screen
	const [burstTimers] = useState(createTimeoutGroup);
	useEffect(() => () => burstTimers.clearAll(), [burstTimers]);

	const addBurst = useCallback(
		(make: (id: number) => Burst) => {
			const burst = make(burstIdRef.current++);
			bursts.modify((list) => {
				"worklet";
				return withBurst(list, burst);
			});
			clock.setActive(true);
		},
		[bursts, clock],
	);

	// Score pops and rings where things happen; shake on the final hit. The frame's player dot
	// is at its live position: the frame was published by the very move that scored. A catch on
	// the same tick as the one before pops a moment later, where that one did (see catchCue).
	useEffect(() => {
		const stagger = createCatchStagger(burstTimers.schedule);
		let catchSpot = { x: 0, y: 0 };
		return onGameEvents(store, (event, frame) => {
			const player = frame.dots.find((d) => d.kind === "player");
			if (!player) return;
			const { x, y, color } = player;
			switch (event.type) {
				case "collect":
				case "collectPoint": {
					if (!event.sameTick) catchSpot = { x, y };
					const at = catchSpot;
					stagger(event.sameTick, () => {
						const pop = catchPop(event, color);
						addBurst((id) => popBurst(id, at.x, at.y, pop.text, burstColor(pop.color)));
						if (event.type === "collectPoint") {
							addBurst((id) => ringBurst(id, at.x, at.y, burstColor(color), 80));
						}
					});
					return;
				}
				case "gameOver":
					addBurst((id) => ringBurst(id, x, y, burstColor(WHITE), 90));
					shake.set(
						withSequence(
							withTiming(-10, { duration: 40 }),
							withTiming(9, { duration: 50 }),
							withTiming(-6, { duration: 50 }),
							withTiming(3, { duration: 50 }),
							withTiming(0, { duration: 60 }),
						),
					);
					return;
				case "pointSpawn":
				case "spit":
					return;
			}
		});
	}, [store, addBurst, shake, burstTimers]);

	return { accent, frost, shake, bursts, burstClock };
}
