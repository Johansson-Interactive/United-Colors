import type React from "react";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { Corners } from "../../domain/types";
import type { ScoreTally } from "../hooks/useScoreTally";
import { cornerButton } from "../layout/cornerButton";
import { useStageBox } from "../layout/StageFrame";
import { IconDot } from "./IconDot";
import { ScoreMeter } from "./ScoreMeter";

interface HUDProps {
	/** The score's tally, fed from the game (see useScoreTally) */
	score: ScoreTally;
	/** The player's current colour; the score wears it so a switch is always visible */
	color: SharedValue<string>;
	/** Whether a run is in play; off play the HUD stays, hidden, so slivers frozen by a pause fly on */
	visible: boolean;
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
 * The screen of a run in play: the score at the top, its slivers flying in across the field,
 * and nothing else over it. The field itself is the way to the pause (see FieldTouch), so
 * there is no button to reach for. It covers the whole stage, home indicator and all, so a
 * catch at the very bottom is seen leaving.
 */
export const HUD: React.FC<HUDProps> = ({ score, color, visible, onPause, corners }) => {
	const { width, height } = useStageBox();
	const cornerAt = useMemo(
		() =>
			cornerButton({ width, height, corners: corners ?? undefined }, CORNER_SIZE, CORNER_OFFSET),
		[width, height, corners],
	);

	return (
		<>
			<View style={[styles.container, !visible && styles.hidden]} pointerEvents="none">
				<ScoreMeter score={score} color={color} visible={visible} />
			</View>
			{visible && onPause ? (
				<View style={[styles.corner, cornerAt]}>
					<IconDot size={CORNER_SIZE} icon="pause" onPress={onPause} accessibilityLabel="Pause" />
				</View>
			) : null}
		</>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFill,
	},
	hidden: {
		opacity: 0,
	},
	corner: {
		position: "absolute",
	},
});
