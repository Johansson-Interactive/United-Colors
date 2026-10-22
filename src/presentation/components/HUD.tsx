import type React from "react";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { Corners } from "../../domain/types";
import { cornerButton } from "../layout/cornerButton";
import { useStageBox } from "../layout/StageFrame";
import { IconDot } from "./IconDot";

interface HUDProps {
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
 * The screen of a run in play: nothing over the field but the score at the top, which the
 * score meter draws (see ScoreMeter), as it outlives the HUD through a pause. The field itself
 * is the way to the pause (see FieldTouch), so there is no button to reach for.
 */
export const HUD: React.FC<HUDProps> = ({ onPause, corners }) => {
	const { width, height } = useStageBox();
	const cornerAt = useMemo(
		() =>
			cornerButton({ width, height, corners: corners ?? undefined }, CORNER_SIZE, CORNER_OFFSET),
		[width, height, corners],
	);

	return (
		<View style={styles.container} pointerEvents="box-none">
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
	corner: {
		position: "absolute",
	},
});
