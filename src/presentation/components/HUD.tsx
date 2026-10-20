import type React from "react";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { GameStore } from "../../application/GameStore";
import type { Corners } from "../../domain/types";
import { cornerButton } from "../layout/cornerButton";
import { useStageBox } from "../layout/StageFrame";
import { IconDot } from "./IconDot";
import { ScoreMeter } from "./ScoreMeter";

interface HUDProps {
	/** The score meter reads its catches here, so a catch re-renders nothing */
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
	const { width, height } = useStageBox();
	const pauseAt = useMemo(
		() => cornerButton({ width, height, corners: corners ?? undefined }, PAUSE_SIZE, PAUSE_OFFSET),
		[width, height, corners],
	);

	return (
		<View style={styles.container} pointerEvents="box-none">
			<View style={styles.score} pointerEvents="none">
				<ScoreMeter store={store} color={color} />
			</View>
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
	},
	pause: {
		position: "absolute",
	},
});
