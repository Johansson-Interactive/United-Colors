import { useEffect } from "react";
import { useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { createCatchStagger } from "../../application/catchCue";
import type { GameStore } from "../../application/GameStore";
import { onGameEvents } from "../../application/gameEvents";
import { BURSTS, layOutBurst } from "../effects/burstFrames";
import { NO_CATCH_SPOT, SHAKE, stepBursts } from "../effects/stageBursts";
import { useEffectLane } from "./useEffectLane";

/**
 * Presentation-only reactions to what the game does: the refusal that ends a run shakes the
 * stage, and score changes burst where the player is. Reads the store; never writes to it.
 * How the field looks behind each screen, frosted or clear and the edges' wash, is the stage
 * look's (see stageLook.ts).
 *
 * The bursts never go through React: each is laid out here once and added to their effect lane
 * (see effectLane.ts), a list on the UI thread, which the game canvas draws at `burstClock`,
 * the frame time (see burstFrames.ts). The clock runs only while a burst is alive.
 */
export function useStageEffects(store: GameStore) {
	const shake = useSharedValue(0);
	const { state: bursts, time: burstClock, add } = useEffectLane(BURSTS, []);

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
				for (const burst of step.bursts) add((id) => layOutBurst(id, burst));
				if (step.shake) {
					shake.set(withSequence(...SHAKE.map(({ to, ms }) => withTiming(to, { duration: ms }))));
				}
			});
		});
		return () => {
			unsubscribe();
			stagger.dispose();
		};
	}, [store, add, shake]);

	return { shake, bursts, burstClock };
}
