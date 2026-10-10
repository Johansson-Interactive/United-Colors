import type React from "react";
import { useEffect, useState } from "react";
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
import { SoundMenu } from "../components/SoundMenu";
import { TiltBowl } from "../components/TiltBowl";
import { BOWL_SIZE, CAPTION, TRIO } from "../theme/theme";
import { useTiltAvailable } from "../tilt/useTiltAvailable";

interface KioskOverlayProps {
	highScore: number;
	soundEnabled: boolean;
	musicEnabled: boolean;
	onStart: (point: PressPoint, color: string) => void;
	/** Open the settle bowl to set the level pose, in the play dot's current colour */
	onCalibrate: (color: string) => void;
	onToggleSound: () => void;
	onToggleMusic: () => void;
}

const TITLE_COLS = 35; // "UNITED" / "COLORS": 6 glyphs x 5 + 5 gaps
const PLAY_SIZE = 128;
const COLOR_CYCLE_MS = 2600;

/** The game colour the play dot shows at `cycle`; mid-blend it is the nearer of the two */
function heldColor(cycle: number): string {
	return TRIO[Math.floor(cycle + 0.06) % TRIO.length];
}

/**
 * Title / attract screen, drawn over the kiosk simulation. The name is set in living dots
 * that drift with the tilt; the play dot rolls in a bowl the way the player will, and the
 * best score waits at the bottom.
 */
export const KioskOverlay: React.FC<KioskOverlayProps> = ({
	highScore,
	soundEnabled,
	musicEnabled,
	onStart,
	onCalibrate,
	onToggleSound,
	onToggleMusic,
}) => {
	const { width } = useWindowDimensions();
	const tiltAvailable = useTiltAvailable();
	const titlePitch = Math.max(6, Math.min(10, Math.floor((width - 56) / TITLE_COLS)));

	// The play dot takes each of the three colours in turn: held, then a quick blend over.
	// It opens on a random one, each equally likely.
	const [startIndex] = useState(() => Math.floor(Math.random() * TRIO.length));
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
			(cycle.value + startIndex) % TRIO.length,
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
						onPress={(point) => onStart(point, heldColor(cycle.value + startIndex))}
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
				<View style={styles.level}>
					<IconDot
						size={44}
						icon="level"
						onPress={() => onCalibrate(heldColor(cycle.value + startIndex))}
						accessibilityLabel="Set level pose"
						color="#F4F6FB"
					/>
				</View>
			</View>

			<SoundMenu
				soundEnabled={soundEnabled}
				musicEnabled={musicEnabled}
				onToggleSound={onToggleSound}
				onToggleMusic={onToggleMusic}
			/>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFill,
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
	level: {
		position: "absolute",
		left: 20,
		bottom: 26,
	},
});
