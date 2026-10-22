import type React from "react";
import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import { PAUSE_HINT, pauseHintLook } from "../flow/pauseHint";
import type { Screen } from "../flow/screenFlow";
import { CAPTION } from "../theme/theme";

interface PauseHintProps {
	/** The run time is read here; only how the hint shows re-renders */
	store: GameStore;
	screen: Screen["kind"];
	/** A touch on the field pauses (not so where touch steers the dot) */
	fieldPauses: boolean;
}

/** Room the hint keeps from the foot of the stage */
const HINT_BOTTOM = 28;

/**
 * The pause hint at the foot of the field, in the title's caption style (see pauseHint.ts). It
 * stays mounted and only its opacity moves, so a finger landing can take it away at once.
 */
export const PauseHint: React.FC<PauseHintProps> = ({ store, screen, fieldPauses }) => {
	const opacity = useStore(
		store,
		(s) => pauseHintLook(screen, s.frame.runTicks, fieldPauses).opacity,
	);
	const over = useStore(store, (s) => pauseHintLook(screen, s.frame.runTicks, fieldPauses).over);
	const shown = useSharedValue(0);
	useEffect(() => {
		shown.set(over > 0 ? withTiming(opacity, { duration: over }) : opacity);
	}, [shown, opacity, over]);
	const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
	return (
		<Animated.View
			style={[styles.foot, style]}
			pointerEvents="none"
			accessibilityElementsHidden={opacity === 0}
			importantForAccessibility={opacity === 0 ? "no-hide-descendants" : "auto"}
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
