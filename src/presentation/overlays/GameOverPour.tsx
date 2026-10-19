import type React from "react";
import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { DotMatrixText } from "../components/DotMatrixText";
import { layoutDotMatrix, matrixBox, pitchToFit } from "../dotmatrix/layout";
import { PourCanvas } from "../effects/PourCanvas";
import type { PourPlan } from "../effects/pourRun";
import {
	type BestRow,
	bonusSpot,
	type PourFit,
	type PourFrame,
	type PourStatus,
	pourFit,
} from "../effects/pourScene";
import { CAPTION, COMBO_AMBER, WHITE } from "../theme/theme";

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
const BONUS_PITCH = 3;
/** Space the `+N` label keeps from the screen's edge (px) */
const EDGE = 8;

interface Box {
	width: number;
	height: number;
}

/**
 * The middle of the game over: the clock, the pour's drop with the tally in it and the best row
 * under it, in a column centred on the drop. The drop's slot is sized for the settled drop from
 * the start, so nothing moves as it grows.
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
				<PourCanvas
					frame={frame}
					x={box.width / 2}
					y={box.height / 2}
					scale={fit.scale}
					pitch={pitch}
				/>
			) : null}
			<View style={styles.row}>
				<DotMatrixText text={status.clock} pitch={CLOCK_PITCH} color={WHITE} opacity={0.7} />
			</View>
			<View style={{ height: 2 * (fit?.half ?? 0) }} />
			<View style={styles.row}>
				<BestRowView row={row} color={color} />
			</View>
			{box && fit && status.settled && plan.bonusLabel ? (
				<BonusLabel text={plan.bonusLabel} plan={plan} box={box} fit={fit} />
			) : null}
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

interface BonusLabelProps {
	text: string;
	plan: PourPlan;
	box: Box;
	fit: PourFit;
}

/** The combo bonus `+N` in amber beside the drop's amber layer, shrunk to fit the screen */
const BonusLabel: React.FC<BonusLabelProps> = ({ text, plan, box, fit }) => {
	const settled = plan.drops[plan.drops.length - 1];
	const spot = bonusSpot(settled.radius, plan.amber);
	const left = box.width / 2 + spot.x * fit.scale;
	const layout = layoutDotMatrix(text);
	const pitch = pitchToFit(layout, box.width - left - EDGE, BONUS_PITCH);
	const { height, pad } = matrixBox(layout, pitch, false, false);
	return (
		<Animated.View
			entering={FadeIn.duration(400)}
			style={[
				styles.bonus,
				{ left: left - pad, top: box.height / 2 + spot.y * fit.scale - height / 2 },
			]}
		>
			<DotMatrixText text={text} pitch={pitch} color={COMBO_AMBER} />
		</Animated.View>
	);
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
	bonus: {
		position: "absolute",
	},
});
