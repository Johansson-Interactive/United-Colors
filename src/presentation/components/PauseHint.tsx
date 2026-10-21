import type React from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import { PAUSE_HINT, pauseHintShown } from "../flow/pauseHint";
import type { Screen } from "../flow/screenFlow";
import { CAPTION } from "../theme/theme";

interface PauseHintProps {
	/** The run time is read here; only whether the hint shows re-renders */
	store: GameStore;
	screen: Screen["kind"];
	/** A touch on the field pauses (not so where touch steers the dot) */
	fieldPauses: boolean;
}

/** Room the hint keeps from the foot of the stage */
const HINT_BOTTOM = 28;

/** The pause hint at the foot of the field, in the title's caption style (see pauseHint.ts) */
export const PauseHint: React.FC<PauseHintProps> = ({ store, screen, fieldPauses }) => {
	const shown = useStore(store, (s) => pauseHintShown(screen, s.frame.runTicks, fieldPauses));
	if (!shown) return null;
	return (
		<Animated.View
			style={styles.foot}
			entering={FadeIn.duration(400)}
			exiting={FadeOut.duration(600)}
			pointerEvents="none"
		>
			<Text style={CAPTION}>{PAUSE_HINT}</Text>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	foot: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: HINT_BOTTOM,
		alignItems: "center",
	},
});
