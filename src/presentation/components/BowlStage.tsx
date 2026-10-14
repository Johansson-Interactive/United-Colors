import type React from "react";
import { useCallback, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { bowlStageLayout, CAPTION_LINE_HEIGHT } from "../layout/bowlStage";
import { CAPTION } from "../theme/theme";

interface BowlStageProps {
	/** The bowl, BOWL_SIZE across */
	children: React.ReactNode;
	/** Sits right above the bowl (the title screen's name) */
	above?: React.ReactNode;
	/** The caption right below the bowl */
	caption: string;
	/** Sits under the caption */
	below?: React.ReactNode;
}

/** Space between the caption and what sits under it */
const BELOW_GAP = 28;

/**
 * Fills its screen and puts the bowl where the title screen has it, the caption the same
 * distance below, so every bowl screen lines up with the others.
 */
export const BowlStage: React.FC<BowlStageProps> = ({ children, above, caption, below }) => {
	const { width, height } = useWindowDimensions();
	const [stageHeight, setStageHeight] = useState<number | null>(null);
	const handleLayout = useCallback(
		(e: LayoutChangeEvent) => setStageHeight(e.nativeEvent.layout.height),
		[],
	);
	const layout = stageHeight === null ? null : bowlStageLayout(stageHeight, width, height);

	return (
		<View style={StyleSheet.absoluteFill} onLayout={handleLayout} pointerEvents="box-none">
			{layout && stageHeight !== null ? (
				<>
					{above ? (
						<View
							style={[styles.slot, { bottom: stageHeight - layout.aboveBottom }]}
							pointerEvents="box-none"
						>
							{above}
						</View>
					) : null}
					<View style={[styles.slot, { top: layout.bowlTop }]} pointerEvents="box-none">
						{children}
					</View>
					<View
						style={[styles.slot, styles.below, { top: layout.captionTop }]}
						pointerEvents="box-none"
					>
						<Text style={styles.caption} pointerEvents="none">
							{caption}
						</Text>
						{below}
					</View>
				</>
			) : null}
		</View>
	);
};

const styles = StyleSheet.create({
	slot: {
		position: "absolute",
		left: 0,
		right: 0,
		alignItems: "center",
	},
	below: {
		gap: BELOW_GAP,
	},
	caption: {
		...CAPTION,
		lineHeight: CAPTION_LINE_HEIGHT,
	},
});
