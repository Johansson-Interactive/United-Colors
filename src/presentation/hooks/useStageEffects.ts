import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { createCatchStagger } from "../../application/catchCue";
import type { GameStore } from "../../application/GameStore";
import { onGameEvents } from "../../application/gameEvents";
import type { GamePhase } from "../../domain/types";
import { BURST_LIFETIME_MS, type Burst, type BurstInput } from "../effects/Bursts";
import { catchPop } from "../effects/catchPop";
import { INK_LIFT, WHITE } from "../theme/theme";
import { createTimeoutGroup } from "./timeoutGroup";

const MAX_BURSTS = 8;

/**
 * Presentation-only reactions to what the game does: the edge wash takes the player's
 * colour, the scene frosts when still, the final hit shakes the stage, and score changes
 * burst where the player is. Reads the store; never writes to it.
 */
export function useStageEffects(store: GameStore, phase: GamePhase, playerColor: string) {
	const accent = useSharedValue<string>(INK_LIFT);
	const frost = useSharedValue(0);
	const shake = useSharedValue(0);
	const [bursts, setBursts] = useState<Burst[]>([]);
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

	// Burst removal timers still pending, cleared on unmount so none fire into a dead screen
	const [burstTimers] = useState(createTimeoutGroup);
	useEffect(() => () => burstTimers.clearAll(), [burstTimers]);

	const addBurst = useCallback(
		(burst: BurstInput) => {
			const id = burstIdRef.current++;
			setBursts((prev) => [...prev.slice(-(MAX_BURSTS - 1)), { ...burst, id } as Burst]);
			burstTimers.schedule(
				() => setBursts((prev) => prev.filter((b) => b.id !== id)),
				BURST_LIFETIME_MS + 50,
			);
		},
		[burstTimers],
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
						addBurst({ kind: "pop", ...at, ...catchPop(event, color) });
						if (event.type === "collectPoint") addBurst({ kind: "ring", ...at, color, size: 80 });
					});
					return;
				}
				case "gameOver":
					addBurst({ kind: "ring", x, y, color: WHITE, size: 90 });
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

	return { accent, frost, shake, bursts };
}
