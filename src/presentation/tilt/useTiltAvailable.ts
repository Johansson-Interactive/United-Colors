import { useState } from "react";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTilt } from "./TiltProvider";

/** React-side mirror of whether real tilt samples have arrived (for captions and fallbacks) */
export function useTiltAvailable(): boolean {
	const tilt = useTilt();
	// Starts from the current value in case it flipped before this hook mounted
	const [available, setAvailable] = useState(() => tilt.available.get());
	useAnimatedReaction(
		() => tilt.available.get(),
		(value, previous) => {
			if (value !== previous) scheduleOnRN(setAvailable, value);
		},
	);
	return available;
}
