import type React from "react";
import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import type { Corners } from "../../domain/types";
import { SCORE_BUMP_MS, scoreBumpScale } from "../effects/scoreBump";
import { cornerButton } from "../layout/cornerButton";
import { useStageBox } from "../layout/StageFrame";
import { DotMatrixText } from "./DotMatrixText";
import { IconDot } from "./IconDot";

interface HUDProps {
	/** The score is read here, so a catch re-renders the HUD alone */
	store: GameStore;
	/** The player's current colour; the score wears it so a switch is always visible */
	color: string;
	onPause: () => void;
	/** How the frame rounds its corners; the pause button keeps clear of the curve (null: square) */
	corners: Corners | null;
}

const PAUSE_SIZE = 44;
const PAUSE_OFFSET = { top: 12, right: 16 };

export const HUD: React.FC<HUDProps> = ({ store, color, onPause, corners }) => {
	const score = useStore(store, (s) => s.frame.score);
	// Progress through the bump (see scoreBump.ts), at rest at 1 between catches
	const bump = useSharedValue(1);
	useEffect(() => {
		if (score === 0) return;
		bump.set(0);
		bump.set(withTiming(1, { duration: SCORE_BUMP_MS, easing: Easing.linear }));
	}, [score, bump]);
	const scoreStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scoreBumpScale(bump.get()) }],
	}));

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
