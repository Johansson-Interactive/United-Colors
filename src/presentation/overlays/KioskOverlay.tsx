import type React from "react";
import { useEffect } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	FadeIn,
	FadeOut,
	interpolateColor,
	useDerivedValue,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { DotButton, type PressPoint } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { IconDot } from "../components/IconDot";
import { TiltBowl } from "../components/TiltBowl";
import { CAPTION, TRIO } from "../theme/theme";
import { useTiltAvailable } from "../tilt/useTiltAvailable";

interface KioskOverlayProps {
	highScore: number;
	soundEnabled: boolean;
	onStart: (point: PressPoint, color: string) => void;
	onToggleSound: () => void;
}

const TITLE_COLS = 35; // "UNITED" / "COLORS": 6 glyphs x 5 + 5 gaps
const PLAY_SIZE = 128;
const BOWL_SIZE = 236;
const COLOR_CYCLE_MS = 2600;

/**
 * Title / attract screen, drawn over the kiosk simulation. The name is set in living dots
 * that drift with the tilt; the play dot rolls in a bowl the way the player will, and the
 * best score waits at the bottom.
 */
export const KioskOverlay: React.FC<KioskOverlayProps> = ({
	highScore,
	soundEnabled,
	onStart,
	onToggleSound,
}) => {
	const { width } = useWindowDimensions();
	const tiltAvailable = useTiltAvailable();
	const titlePitch = Math.max(6, Math.min(10, Math.floor((width - 56) / TITLE_COLS)));

	// The play dot takes each of the three colours in turn: held, then a quick blend over
	const cycle = useSharedValue(0);
	useEffect(() => {
		cycle.value = withRepeat(
			withTiming(3, { duration: COLOR_CYCLE_MS * 3, easing: Easing.linear }),
			-1,
		);
		return () => cancelAnimation(cycle);
	}, [cycle]);
	const playColor = useDerivedValue(() =>
		interpolateColor(
			cycle.value,
			[0, 0.88, 1, 1.88, 2, 2.88, 3],
			[TRIO[0], TRIO[0], TRIO[1], TRIO[1], TRIO[2], TRIO[2], TRIO[0]],
		),
	);

	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(500)}
			exiting={FadeOut.duration(250)}
			pointerEvents="box-none"
		>
			<View style={styles.title} pointerEvents="none">
				<DotMatrixText
					text={"UNITED\nCOLORS"}
					pitch={titlePitch}
					colors={TRIO}
					glow
					parallax
					wave
				/>
			</View>

			<View style={styles.centre} pointerEvents="box-none">
				<TiltBowl size={BOWL_SIZE} dotSize={PLAY_SIZE}>
					<DotButton
						size={PLAY_SIZE}
						color={playColor}
						label="PLAY"
						labelPitch={4}
						onPress={(point) => onStart(point, playColor.value)}
						accessibilityLabel="Play"
					/>
				</TiltBowl>
				<Text style={styles.caption}>
					{tiltAvailable ? "tilt to roll  ·  tap to play" : "tap to play"}
				</Text>
			</View>

			<View style={styles.footer} pointerEvents="box-none">
				<View style={styles.best} pointerEvents="none">
					<DotMatrixText text={`BEST ${highScore}`} pitch={4} color="rgba(244,246,251,0.6)" />
				</View>
				<View style={styles.sound}>
					<IconDot
						size={44}
						icon={soundEnabled ? "sound-on" : "sound-off"}
						onPress={onToggleSound}
						accessibilityLabel={soundEnabled ? "Mute sound" : "Unmute sound"}
						color={soundEnabled ? "#F4F6FB" : "rgba(244,246,251,0.45)"}
					/>
				</View>
			</View>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFillObject,
	},
	title: {
		alignItems: "center",
		paddingTop: 22,
	},
	centre: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 26,
	},
	caption: {
		...CAPTION,
	},
	footer: {
		height: 96,
		alignItems: "center",
		justifyContent: "center",
	},
	best: {
		alignItems: "center",
	},
	sound: {
		position: "absolute",
		right: 20,
		bottom: 26,
	},
});
