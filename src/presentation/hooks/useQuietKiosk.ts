import { useEffect } from "react";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { GameSession } from "../../application/GameSession";
import type { GameStore } from "../../application/GameStore";

/**
 * While `quiet`, the kiosk stops and its stage fades out, so only the settle bowl over it
 * moves; back on the title it fades in and runs on from where it stopped. A game started from
 * the bowl starts its own clock under the flood and shows at once. Returns the stage's fade
 * style.
 */
export function useQuietKiosk(quiet: boolean, store: GameStore, session: GameSession) {
	const opacity = useSharedValue(1);

	useEffect(() => {
		if (!quiet) return;
		session.halt();
		opacity.set(withTiming(0, { duration: 300 }));
		return () => {
			if (store.getState().frame.phase !== "KIOSK") {
				opacity.set(1);
				return;
			}
			opacity.set(withTiming(1, { duration: 400 }));
			session.run();
		};
	}, [quiet, store, session, opacity]);

	return useAnimatedStyle(() => ({ opacity: opacity.get() }));
}
