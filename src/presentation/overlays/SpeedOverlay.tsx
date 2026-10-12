import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { DotButton } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { IconDot } from "../components/IconDot";
import { TiltBowl } from "../components/TiltBowl";
import { BOWL_SIZE, CAPTION, DIM, WHITE } from "../theme/theme";
import { SENSITIVITY_CHOICES, sensitivityChoice } from "../tilt/sensitivity";
import { useTiltAvailable } from "../tilt/useTiltAvailable";

interface SpeedOverlayProps {
	/** Colour of the dot in the bowl and of the chosen speed (the player's) */
	color: string;
	/** Tilt sensitivity, a multiple of the default speed */
	sensitivity: number;
	onSelect: (value: number) => void;
	onBack: () => void;
}

/** About the player dot's size, so the bowl rolls what will be played */
const DOT_SIZE = 56;
const CHOICE_SIZE = 52;
const CAPTION_LINE_HEIGHT = 20;

/**
 * Choosing the tilt speed. The player's dot rolls in the bowl as fast as it will in the game,
 * and the three speeds sit in a row beneath it, slow to fast, each a comet whose tail grows
 * with the speed. Tapping one takes it at once, so the next tilt already feels the change.
 */
export const SpeedOverlay: React.FC<SpeedOverlayProps> = ({
	color,
	sensitivity,
	onSelect,
	onBack,
}) => {
	const tiltAvailable = useTiltAvailable();
	const current = sensitivityChoice(sensitivity);
	const caption = tiltAvailable
		? `${current.label}\ntilt to feel it  ·  tap to change`
		: `${current.label}\nno tilt sensor here`;

	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(200)}
		>
			<View style={styles.top} pointerEvents="none">
				<DotMatrixText text="SPEED" pitch={6} color={WHITE} glow />
			</View>

			<View style={styles.centre} pointerEvents="box-none">
				<View pointerEvents="none">
					<TiltBowl size={BOWL_SIZE} dotSize={DOT_SIZE} sensitivity={current.value}>
						<DotButton
							size={DOT_SIZE}
							color={color}
							liquid
							disabled
							onPress={() => {}}
							accessibilityLabel="Your dot"
						/>
					</TiltBowl>
				</View>
				<View style={styles.choices}>
					{SENSITIVITY_CHOICES.map((choice) => {
						const chosen = choice.key === current.key;
						return (
							<IconDot
								key={choice.key}
								size={CHOICE_SIZE}
								icon={`speed-${choice.key}`}
								onPress={() => onSelect(choice.value)}
								accessibilityLabel={`${choice.label} tilt speed${chosen ? ", chosen" : ""}`}
								color={chosen ? color : DIM}
							/>
						);
					})}
				</View>
				<Text style={styles.caption} pointerEvents="none">
					{caption}
				</Text>
			</View>

			<View style={styles.footer}>
				<DotButton
					size={80}
					color={WHITE}
					variant="ghost"
					label="BACK"
					labelPitch={3}
					onPress={onBack}
					accessibilityLabel="Back"
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
		paddingTop: 52,
	},
	centre: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 28,
	},
	choices: {
		flexDirection: "row",
		gap: 28,
	},
	caption: {
		...CAPTION,
		lineHeight: CAPTION_LINE_HEIGHT,
		minHeight: CAPTION_LINE_HEIGHT * 2,
	},
	footer: {
		alignItems: "center",
		paddingBottom: 44,
	},
});
