import type React from "react";
import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import type { Corners } from "../../domain/types";
import { cornerButton } from "../layout/cornerButton";
import { useStageBox } from "../layout/StageFrame";
import { DotMatrixText } from "./DotMatrixText";
import { IconDot } from "./IconDot";

interface HUDProps {
	score: number;
	/** The player's current colour; the score wears it so a switch is always visible */
	color: string;
	onPause: () => void;
	/** How the frame rounds its corners; the pause button keeps clear of the curve (null: square) */
	corners: Corners | null;
}

const PAUSE_SIZE = 44;
const PAUSE_OFFSET = { top: 12, right: 16 };

export const HUD: React.FC<HUDProps> = ({ score, color, onPause, corners }) => {
	const bump = useSharedValue(1);
	useEffect(() => {
		if (score === 0) return;
		bump.set(
			withSequence(
				withTiming(1.22, { duration: 70 }),
				withSpring(1, { damping: 9, stiffness: 260 }),
			),
		);
	}, [score, bump]);
	const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.get() }] }));

	const { width, height } = useStageBox();
	const pauseAt = useMemo(
		() => cornerButton({ width, height, corners: corners ?? undefined }, PAUSE_SIZE, PAUSE_OFFSET),
		[width, height, corners],
	);

	return (
		<View style={styles.container} pointerEvents="box-none">
			<Animated.View style={[styles.score, scoreStyle]} pointerEvents="none">
				<DotMatrixText text={String(score)} pitch={7} color={color} glow />
			</Animated.View>
			<View style={[styles.pause, pauseAt]}>
				<IconDot size={PAUSE_SIZE} icon="pause" onPress={onPause} accessibilityLabel="Pause" />
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
	},
});
