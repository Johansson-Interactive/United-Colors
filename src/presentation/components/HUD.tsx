import type React from "react";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { DotMatrixText } from "./DotMatrixText";
import { IconDot } from "./IconDot";

interface HUDProps {
	score: number;
	/** The player's current colour; the score wears it so a switch is always visible */
	color: string;
	onPause: () => void;
}

export const HUD: React.FC<HUDProps> = ({ score, color, onPause }) => {
	const bump = useSharedValue(1);
	useEffect(() => {
		if (score === 0) return;
		bump.value = withSequence(
			withTiming(1.22, { duration: 70 }),
			withSpring(1, { damping: 9, stiffness: 260 }),
		);
	}, [score, bump]);
	const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

	return (
		<View style={styles.container} pointerEvents="box-none">
			<Animated.View style={[styles.score, scoreStyle]} pointerEvents="none">
				<DotMatrixText text={String(score)} pitch={7} color={color} glow />
			</Animated.View>
			<View style={styles.pause}>
				<IconDot size={44} icon="pause" onPress={onPause} accessibilityLabel="Pause" />
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFill,
	},
	score: {
		position: "absolute",
		top: 10,
		left: 0,
		right: 0,
		alignItems: "center",
	},
	pause: {
		position: "absolute",
		top: 12,
		right: 16,
	},
});
