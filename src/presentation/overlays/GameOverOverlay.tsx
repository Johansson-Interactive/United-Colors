import type React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from "react-native-reanimated";
import { DotButton, type PressPoint } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { Confetti } from "../effects/Confetti";
import { CAPTION, WHITE } from "../theme/theme";

interface GameOverOverlayProps {
	score: number;
	/** Best score before this run, to recognise a new record */
	previousBest: number;
	/** The player's final colour; the result and the retry dot wear it */
	color: string;
	onRetry: (point: PressPoint) => void;
	onBack: (point: PressPoint) => void;
}

const TITLE_COLS = 51; // "GAME OVER"

export const GameOverOverlay: React.FC<GameOverOverlayProps> = ({
	score,
	previousBest,
	color,
	onRetry,
	onBack,
}) => {
	const { width } = useWindowDimensions();
	const isNewBest = score > previousBest;
	const best = Math.max(score, previousBest);
	const titlePitch = Math.max(5, Math.min(7, Math.floor((width - 48) / TITLE_COLS)));
	const scorePitch = String(score).length > 3 ? 11 : 14;

	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.delay(350).duration(400)}
			exiting={FadeOut.duration(200)}
		>
			{isNewBest ? <Confetti /> : null}

			<View style={styles.top} pointerEvents="none">
				<DotMatrixText text="GAME OVER" pitch={titlePitch} color={WHITE} />
			</View>

			<View style={styles.centre} pointerEvents="none">
				<Animated.View entering={ZoomIn.delay(500).springify().damping(13)}>
					<DotMatrixText text={String(score)} pitch={scorePitch} color={color} glow />
				</Animated.View>
				<Animated.View entering={FadeInDown.delay(800).duration(400)} style={styles.bestRow}>
					{isNewBest ? (
						<DotMatrixText text="NEW BEST!" pitch={5} colors={[color, WHITE, color]} glow />
					) : (
						<Text style={styles.caption}>best {best}</Text>
					)}
				</Animated.View>
			</View>

			<Animated.View style={styles.actions} entering={FadeInDown.delay(950).duration(450)}>
				<DotButton
					size={124}
					color={color}
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
			</Animated.View>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFillObject,
	},
	top: {
		alignItems: "center",
		paddingTop: 44,
	},
	centre: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 22,
	},
	bestRow: {
		alignItems: "center",
	},
	caption: {
		...CAPTION,
		fontSize: 13,
	},
	actions: {
		alignItems: "center",
		paddingBottom: 48,
		gap: 26,
	},
});
