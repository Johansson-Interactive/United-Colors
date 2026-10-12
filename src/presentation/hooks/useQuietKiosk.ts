import { useEffect } from "react";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { GameStore } from "../../application/GameStore";
import { quietsKiosk, type SettleFrom } from "../overlays/settleFrom";

/**
 * While the settle bowl is open over the title (`settleFrom`), the kiosk stops and its stage fades out, so only the settle bowl moves; back
 * on the title it fades in and runs on from where it stopped. A game started from the bowl
 * starts its own clock under the flood and shows at once. Returns the stage's fade style.
 */
export function useQuietKiosk(
	settleFrom: SettleFrom | null,
	store: GameStore,
	stopClock: () => void,
	startClock: () => void,
) {
	const opacity = useSharedValue(1);
	const quiet = settleFrom !== null && quietsKiosk(settleFrom);

	useEffect(() => {
		if (!quiet) return;
		stopClock();
		opacity.set(withTiming(0, { duration: 300 }));
		return () => {
			if (store.getState().frame.phase !== "KIOSK") {
				opacity.set(1);
				return;
			}
			opacity.set(withTiming(1, { duration: 400 }));
			startClock();
		};
	}, [quiet, store, stopClock, startClock, opacity]);

	return useAnimatedStyle(() => ({ opacity: opacity.get() }));
}
