import type React from "react";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { type SharedValue, useAnimatedReaction } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import { runClock } from "../../domain/run";
import { layoutDotMatrix, matrixBox } from "../dotmatrix/layout";
import { shownScore } from "../effects/scoreTally";
import type { ScoreTally } from "../hooks/useScoreTally";
import { middlePitch, middleSpot, TIME_PITCH } from "../layout/pausedScore";
import { useStageBox } from "../layout/StageFrame";
import { WHITE } from "../theme/theme";
import { DotMatrixText } from "./DotMatrixText";

interface PausedScoreProps {
	/** The run time so far is read here */
	store: GameStore;
	/** The player's colour; the score wears it, never combo amber, as nothing counts while paused */
	color: SharedValue<string>;
	/**
	 * The score's tally (see useScoreTally): the score shown is the one the HUD showed, without
	 * the slivers frozen in the air, so nothing jumps between the two
	 */
	score: ScoreTally;
}

/**
 * The paused run's score and run time, still in the pause's middle (see pausedScore.ts). It is
 * part of the pause's content, mounted only while that is there (see pauseContent.ts), and is
 * simply in place: nothing sinks, swells or pops in.
 */
export const PausedScore: React.FC<PausedScoreProps> = ({
	store,
	color,
	score: { tally, clock: tallyClock },
}) => {
	const { width, height } = useStageBox();
	const insets = useSafeAreaInsets();
	// The stage's own height: the interface layer keeps clear of the home indicator
	const stageHeight = height - insets.bottom;
	const ticks = useStore(store, (s) => s.frame.runTicks);
	// The score as the HUD shows it, which stands still while paused: right from the first frame
	const [score, setScore] = useState(() => shownScore(tally.get(), tallyClock.get()));
	useAnimatedReaction(
		() => shownScore(tally.get(), tallyClock.get()),
		(shown, previous) => {
			if (shown !== previous) scheduleOnRN(setScore, shown);
		},
	);
	const pitch = useMemo(() => middlePitch(score, width), [score, width]);
	const text = String(score);
	const scoreBox = useMemo(
		() => matrixBox(layoutDotMatrix(text), pitch, true, false),
		[text, pitch],
	);
	const clock = runClock(ticks);
	const timeBox = useMemo(
		() => matrixBox(layoutDotMatrix(clock), TIME_PITCH, false, false),
		[clock],
	);
	const { scoreY, timeY } = middleSpot(stageHeight, pitch);

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			<View style={[styles.row, { top: scoreY - scoreBox.height / 2 }]}>
				<DotMatrixText text={text} pitch={pitch} color={color} glow />
			</View>
			<View style={[styles.row, { top: timeY - timeBox.height / 2 }]}>
				<DotMatrixText text={clock} pitch={TIME_PITCH} color={WHITE} />
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	row: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		alignItems: "center",
	},
});
