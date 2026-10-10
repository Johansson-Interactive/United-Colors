import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import {
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import type { GameStore, GameStoreState } from "../../application/GameStore";
import type { GameEngine } from "../../domain/engine/GameEngine";
import type { GamePhase } from "../../domain/types";
import { BURST_LIFETIME_MS, type Burst, type BurstInput } from "../effects/Bursts";
import { INK_LIFT, WHITE } from "../theme/theme";

const MAX_BURSTS = 8;

/**
 * Presentation-only reactions to what the game does: the edge wash takes the player's
 * colour, the scene frosts when still, the final hit shakes the stage, and score changes
 * burst where the player is. Reads the store and engine; never writes to them.
 */
export function useStageEffects(
	store: GameStore,
	getEngine: () => GameEngine,
	phase: GamePhase,
	playerColor: string,
) {
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

	const addBurst = useCallback((burst: BurstInput) => {
		const id = burstIdRef.current++;
		setBursts((prev) => [...prev.slice(-(MAX_BURSTS - 1)), { ...burst, id } as Burst]);
		setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), BURST_LIFETIME_MS + 50);
	}, []);

	// Score pops and rings where things happen; shake on the final hit
	const handleStoreChange = useEffectEvent((state: GameStoreState, previous: GameStoreState) => {
		const delta = state.frame.score - previous.frame.score;
		const player = state.frame.dots.find((d) => d.kind === "player");
		if (delta > 0 && state.frame.phase === "RUNNING" && player) {
			const pos = getEngine().getPlayerPosition();
			addBurst({ kind: "pop", x: pos.x, y: pos.y, text: `+${delta}`, color: player.color });
			if (delta >= 5) {
				addBurst({ kind: "ring", x: pos.x, y: pos.y, color: player.color, size: 80 });
			}
		}
		if (state.frame.phase === "GAME_OVER" && previous.frame.phase !== "GAME_OVER") {
			const pos = getEngine().getPlayerPosition();
			addBurst({ kind: "ring", x: pos.x, y: pos.y, color: WHITE, size: 90 });
			shake.set(
				withSequence(
					withTiming(-10, { duration: 40 }),
					withTiming(9, { duration: 50 }),
					withTiming(-6, { duration: 50 }),
					withTiming(3, { duration: 50 }),
					withTiming(0, { duration: 60 }),
				),
			);
		}
	});
	// Reads the latest engine getter without resubscribing when it changes
	useEffect(
		() => store.subscribe((state, previous) => handleStoreChange(state, previous)),
		[store],
	);

	const shakeStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: shake.value }],
	}));

	return { accent, frost, shakeStyle, bursts };
}
