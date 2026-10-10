import type React from "react";
import { StyleSheet } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { INK } from "../theme/theme";

const MAX_DIM = 0.5;

/** Full-window darkening that accompanies the frosted playfield while paused or over */
export const FrostDim: React.FC<{ frost: SharedValue<number> }> = ({ frost }) => {
	const style = useAnimatedStyle(() => ({ opacity: frost.get() * MAX_DIM }));
	return (
		<Animated.View style={[StyleSheet.absoluteFill, styles.dim, style]} pointerEvents="none" />
	);
};

const styles = StyleSheet.create({
	dim: { backgroundColor: INK },
});
