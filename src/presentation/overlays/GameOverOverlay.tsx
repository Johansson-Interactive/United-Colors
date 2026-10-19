import type React from "react";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import type { GameAudio } from "../../application/ports";
import { DotButton, type PressPoint } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { Confetti } from "../effects/Confetti";
import { planPour } from "../effects/pourRun";
import { bestRow, POUR_DELAY_MS, pourInput } from "../effects/pourScene";
import { usePour } from "../hooks/usePour";
import { WHITE } from "../theme/theme";
import { GameOverPour } from "./GameOverPour";

interface GameOverOverlayProps {
	/**
	 * The run that ended and its verdict on the personal best are read here; the best row shows
	 * once the run is judged
	 */
	store: GameStore;
	/** The player's final colour; the pour and the retry drop of their liquid wear it */
	color: string;
	/** The pour's catches sound through it, quietly */
	audio: GameAudio;
	onRetry: (point: PressPoint) => void;
	onBack: (point: PressPoint) => void;
}

const TITLE_COLS = 51; // "GAME OVER"

/**
 * The game over: the run poured into a drop of the player's liquid (see pourRun.ts) under the
 * title, with AGAIN and MENU live from its first frame. The pour is worked out once, as the
 * game over appears, and stops when it goes.
 */
export const GameOverOverlay: React.FC<GameOverOverlayProps> = ({
	store,
	color,
	audio,
	onRetry,
	onBack,
}) => {
	const verdict = useStore(store, (s) => s.verdict);
	const { width } = useWindowDimensions();
	const titlePitch = Math.max(5, Math.min(7, Math.floor((width - 48) / TITLE_COLS)));
	const [{ plan, pitch }] = useState(() => {
		const input = pourInput(store.getState(), color);
		return { plan: planPour(input), pitch: input.pitch };
	});
	const { frame, status } = usePour(plan, audio);
	const row = bestRow(status, verdict);

	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.delay(POUR_DELAY_MS).duration(400)}
			exiting={FadeOut.duration(200)}
		>
			{row.kind === "newBest" ? <Confetti /> : null}

			<View style={styles.top} pointerEvents="none">
				<DotMatrixText text="GAME OVER" pitch={titlePitch} color={WHITE} />
			</View>

			<GameOverPour
				plan={plan}
				pitch={pitch}
				frame={frame}
				status={status}
				row={row}
				color={color}
			/>

			<View style={styles.actions}>
				<DotButton
					size={124}
					color={color}
					liquid
					label="AGAIN"
					labelPitch={4}
					onPress={onRetry}
					accessibilityLabel="Play again"
				/>
				<DotButton
					size={80}
					color={WHITE}
					variant="ghost"
					label="MENU"
					labelPitch={3}
					onPress={onBack}
					accessibilityLabel="Back to menu"
				/>
			</View>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFill,
	},
	top: {
		alignItems: "center",
		paddingTop: 44,
	},
	actions: {
		alignItems: "center",
		paddingBottom: 48,
		gap: 26,
	},
});
