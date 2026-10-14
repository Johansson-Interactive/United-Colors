import type React from "react";
import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
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
import { BowlStage } from "../components/BowlStage";
import { DotButton, type PressPoint } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { IconDot } from "../components/IconDot";
import { SoundMenu } from "../components/SoundMenu";
import { TiltBowl } from "../components/TiltBowl";
import { TITLE, TITLE_FOOTER_HEIGHT, titlePitch } from "../layout/bowlStage";
import { BOWL_SIZE, TRIO } from "../theme/theme";
import { useTiltAvailable } from "../tilt/useTiltAvailable";
import { playColourAt } from "./playColour";

interface KioskOverlayProps {
	highScore: number;
	soundEnabled: boolean;
	musicEnabled: boolean;
	onStart: (point: PressPoint, color: string) => void;
	/** Open the settle bowl to set the level pose, in the play dot's current colour */
	onCalibrate: (color: string) => void;
	onToggleSound: () => void;
	onToggleMusic: () => void;
	/** Tilt sensitivity, so the play dot rolls as fast as the player dot will */
	sensitivity: number;
}

const PLAY_SIZE = 128;
const COLOR_CYCLE_MS = 2600;

/** The game colour the play dot shows at `cycle`; mid-blend it is the nearer of the two */
function heldColor(cycle: number): string {
	return TRIO[Math.floor(cycle + 0.06) % TRIO.length];
}

/**
 * Title / attract screen, drawn over the kiosk simulation. The name, one colour per letter,
 * sits right above the bowl so the two read as one group, lifted a little above centre; it
 * drifts with the tilt. The play dot is a drop of the player's liquid rolling in a bowl the
 * way the player will, and the best score waits at the bottom.
 */
export const KioskOverlay: React.FC<KioskOverlayProps> = ({
	highScore,
	soundEnabled,
	musicEnabled,
	onStart,
	onCalibrate,
	onToggleSound,
	onToggleMusic,
	sensitivity,
}) => {
	const { width } = useWindowDimensions();
	const tiltAvailable = useTiltAvailable();

	// The play dot takes each of the three colours in turn: held, then a quick blend over.
	// It opens on a random one, each equally likely.
	const [startIndex] = useState(() => Math.floor(Math.random() * TRIO.length));
	const cycle = useSharedValue(0);
	useEffect(() => {
		cycle.set(
			withRepeat(withTiming(3, { duration: COLOR_CYCLE_MS * 3, easing: Easing.linear }), -1),
		);
		return () => cancelAnimation(cycle);
	}, [cycle]);
	const playColor = useDerivedValue(() =>
		playColourAt((cycle.get() + startIndex) % TRIO.length, interpolateColor),
	);

	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(500)}
			exiting={FadeOut.duration(250)}
			pointerEvents="box-none"
		>
			<BowlStage
				above={
					<DotMatrixText
						text={TITLE}
						pitch={titlePitch(width)}
						dotScale={0.42}
						colors={TRIO}
						colorBy="letter"
						glow
						parallax
						wave
					/>
				}
				caption={tiltAvailable ? "tilt to roll  ·  tap to play" : "tap to play"}
			>
				<TiltBowl size={BOWL_SIZE} dotSize={PLAY_SIZE} sensitivity={sensitivity}>
					<DotButton
						size={PLAY_SIZE}
						color={playColor}
						liquid
						label="PLAY"
						labelPitch={4}
						onPress={(point) => onStart(point, heldColor(cycle.get() + startIndex))}
						accessibilityLabel="Play"
					/>
				</TiltBowl>
			</BowlStage>

			<View style={styles.footer} pointerEvents="box-none">
				<View style={styles.best} pointerEvents="none">
					<DotMatrixText text={`BEST ${highScore}`} pitch={4} color="rgba(244,246,251,0.6)" />
				</View>
				<View style={styles.level}>
					<IconDot
						size={44}
						icon="level"
						onPress={() => onCalibrate(heldColor(cycle.get() + startIndex))}
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
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: TITLE_FOOTER_HEIGHT,
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
