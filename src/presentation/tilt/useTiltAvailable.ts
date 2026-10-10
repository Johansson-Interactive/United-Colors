import { useEffect, useState } from "react";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTilt } from "./TiltProvider";

/** React-side mirror of whether real tilt samples have arrived (for captions and fallbacks) */
export function useTiltAvailable(): boolean {
	const tilt = useTilt();
	const [available, setAvailable] = useState(false);
	useAnimatedReaction(
		() => tilt.available.value,
		(value, previous) => {
			if (value !== previous) scheduleOnRN(setAvailable, value);
		},
	);
	useEffect(() => {
		// Pick up the value if it flipped before this hook mounted
		if (tilt.available.value) setAvailable(true);
	}, [tilt.available]);
	return available;
}
