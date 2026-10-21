import type React from "react";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { GameStore } from "../../application/GameStore";
import type { Corners } from "../../domain/types";
import { SCORE_TOP } from "../effects/scoreTally";
import { cornerButton } from "../layout/cornerButton";
import { useStageBox } from "../layout/StageFrame";
import { IconDot } from "./IconDot";
import { ScoreMeter } from "./ScoreMeter";

interface HUDProps {
	/** The score meter reads its catches here, so a catch re-renders nothing */
	store: GameStore;
	/** The player's current colour; the score wears it so a switch is always visible */
	color: SharedValue<string>;
	/**
	 * Dev only: a pause dot in the top-right corner, for the control mode where touch steers
	 * the dot and so cannot pause it (see useDevControlMode). Play pauses on any touch otherwise.
	 */
	onPause?: () => void;
	/** How the frame rounds its corners; the corner dot keeps clear of the curve (null: square) */
	corners: Corners | null;
}

const CORNER_SIZE = 44;
const CORNER_OFFSET = { top: 12, right: 16 };

/**
 * The screen of a run in play: the score at the top, and nothing else over the field. The
 * field itself is the way to the pause (see FieldTouch), so there is no button to reach for.
 */
export const HUD: React.FC<HUDProps> = ({ store, color, onPause, corners }) => {
	const { width, height } = useStageBox();
	const cornerAt = useMemo(
		() =>
			cornerButton({ width, height, corners: corners ?? undefined }, CORNER_SIZE, CORNER_OFFSET),
		[width, height, corners],
	);

	return (
		<View style={styles.container} pointerEvents="box-none">
			<View style={styles.score} pointerEvents="none">
				<ScoreMeter store={store} color={color} />
			</View>
			{onPause ? (
				<View style={[styles.corner, cornerAt]}>
					<IconDot size={CORNER_SIZE} icon="pause" onPress={onPause} accessibilityLabel="Pause" />
				</View>
			) : null}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFill,
	},
	score: {
		position: "absolute",
		top: SCORE_TOP,
		left: 0,
		right: 0,
	},
	corner: {
		position: "absolute",
	},
});
