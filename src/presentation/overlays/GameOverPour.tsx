import type React from "react";
import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { DotMatrixText } from "../components/DotMatrixText";
import { PourCanvas } from "../effects/PourCanvas";
import type { PourPlan } from "../effects/pourRun";
import { type BestRow, type PourFrame, type PourStatus, pourFit } from "../effects/pourScene";
import { CAPTION, WHITE } from "../theme/theme";

interface GameOverPourProps {
	plan: PourPlan;
	/** The tally's dot spacing (px, before the pour is scaled to fit) */
	pitch: number;
	frame: SharedValue<PourFrame>;
	status: PourStatus;
	row: BestRow;
	/** The player's final colour, for NEW BEST! */
	color: string;
}

/** Height of the clock's row above the drop and the best row under it, and the gap to each */
const ROW_HEIGHT = 36;
const ROW_GAP = 18;
const CLOCK_PITCH = 4;

interface Box {
	width: number;
	height: number;
}

/**
 * The middle of the game over: the clock, the pour's drop with the tally in it and the best row
 * under it, in a column centred on the drop. The drop's slot is sized for the settled drop and
 * the tally as it stands before the bonus pours it into the drop's top part, from the start, so
 * nothing moves as it grows.
 */
export const GameOverPour: React.FC<GameOverPourProps> = ({
	plan,
	pitch,
	frame,
	status,
	row,
	color,
}) => {
	const [box, setBox] = useState<Box | null>(null);
	const handleLayout = (event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		setBox({ width, height });
	};
	const fit = box ? pourFit(plan, pitch, box.height - 2 * (ROW_HEIGHT + ROW_GAP)) : null;

	return (
		<View style={styles.centre} onLayout={handleLayout} pointerEvents="none">
			{box && fit ? (
				<PourCanvas frame={frame} x={box.width / 2} y={box.height / 2} scale={fit.scale} />
			) : null}
			<View style={styles.row}>
				<DotMatrixText text={status.clock} pitch={CLOCK_PITCH} color={WHITE} opacity={0.7} />
			</View>
			<View style={{ height: 2 * (fit?.half ?? 0) }} />
			<View style={styles.row}>
				<BestRowView row={row} color={color} />
			</View>
		</View>
	);
};

const BestRowView: React.FC<{ row: BestRow; color: string }> = ({ row, color }) => {
	switch (row.kind) {
		case "none":
			return null;
		case "best":
			return (
				<Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(120)}>
					<Text style={styles.caption}>best {row.best}</Text>
				</Animated.View>
			);
		case "newBest":
			return (
				<Animated.View entering={FadeInDown.duration(400)}>
					<DotMatrixText text="NEW BEST!" pitch={5} colors={[color, WHITE, color]} glow />
				</Animated.View>
			);
	}
};

const styles = StyleSheet.create({
	centre: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: ROW_GAP,
	},
	row: {
		height: ROW_HEIGHT,
		alignItems: "center",
		justifyContent: "center",
	},
	caption: {
		...CAPTION,
		fontSize: 13,
	},
});
