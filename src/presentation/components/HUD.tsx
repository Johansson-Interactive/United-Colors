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
	/** The score shows in play only; the pause and Get ready keep just the corner dot */
	showScore: boolean;
	/** What the corner dot does: pause in play and Get ready, play on the pause screen */
	corner: "pause" | "play";
	onCorner: () => void;
	/** How the frame rounds its corners; the corner dot keeps clear of the curve (null: square) */
	corners: Corners | null;
}

const CORNER_SIZE = 44;
const CORNER_OFFSET = { top: 12, right: 16 };

const LABELS = { pause: "Pause", play: "Play" } as const;

export const HUD: React.FC<HUDProps> = ({ store, color, showScore, corner, onCorner, corners }) => {
	const { width, height } = useStageBox();
	const cornerAt = useMemo(
		() =>
			cornerButton({ width, height, corners: corners ?? undefined }, CORNER_SIZE, CORNER_OFFSET),
		[width, height, corners],
	);

	return (
		<View style={styles.container} pointerEvents="box-none">
			{showScore ? (
				<View style={styles.score} pointerEvents="none">
					<ScoreMeter store={store} color={color} />
				</View>
			) : null}
			<View style={[styles.corner, cornerAt]}>
				<IconDot
					size={CORNER_SIZE}
					icon={corner}
					onPress={onCorner}
					accessibilityLabel={LABELS[corner]}
				/>
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
	corner: {
		position: "absolute",
	},
});
