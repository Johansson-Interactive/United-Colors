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
import { SettingsMenu } from "../components/SettingsMenu";
import { SoundMenu } from "../components/SoundMenu";
import { TiltBowl } from "../components/TiltBowl";
import { TITLE, TITLE_FOOTER_HEIGHT, titlePitch } from "../layout/bowlStage";
import { BOWL_SIZE, DIM, TRIO, whiteAt } from "../theme/theme";
import { useTiltAvailable } from "../tilt/useTiltAvailable";
import { playColourAt } from "./playColour";

interface KioskOverlayProps {
	highScore: number;
	onStart: (point: PressPoint, color: string) => void;
	/** Open the settle bowl to set the level pose, in the play dot's current colour */
	onCalibrate: (color: string) => void;
	/** Tilt sensitivity, so the play dot rolls as fast as the player dot will; the speed dot shows it */
	sensitivity: number;
	/** Open the speed view, in the play dot's current colour */
	onSpeed: (color: string) => void;
	/** The version and build, shown as small print under the best score; empty shows none */
	versionTag: string;
}

const PLAY_SIZE = 128;
/** The version tag's dots: finer than any other matrix text, so it reads as small print */
const VERSION_PITCH = 1.5;
/** How far the version row sits above the footer's edge, clear of the best score above it */
const VERSION_BOTTOM = 6;
const COLOR_CYCLE_MS = 2600;

/** The game colour the play dot shows at `cycle`; mid-blend it is the nearer of the two */
function heldColor(cycle: number): string {
	return TRIO[Math.floor(cycle + 0.06) % TRIO.length];
}

/**
 * Title / attract screen, drawn over the kiosk simulation. The name, one colour per letter,
 * sits right above the bowl so the two read as one group, lifted a little above centre; it
 * drifts with the tilt. The play dot is a drop of the player's liquid rolling in a bowl the
 * way the player will, and the best score waits at the bottom, with the version and build as
 * small print beneath it. The corners hold the settings and the sound, as on the pause.
 */
export const KioskOverlay: React.FC<KioskOverlayProps> = ({
	highScore,
	onStart,
	onCalibrate,
	sensitivity,
	onSpeed,
	versionTag,
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
	/** The colour the play dot holds now, which whatever it opens takes on */
	const colorNow = () => heldColor(cycle.get() + startIndex);

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
						onPress={(point) => onStart(point, colorNow())}
						accessibilityLabel="Play"
					/>
				</TiltBowl>
			</BowlStage>

			<View style={styles.footer} pointerEvents="none">
				<View style={styles.best}>
					<DotMatrixText text={`BEST ${highScore}`} pitch={4} color={whiteAt(0.6)} />
				</View>
				{versionTag ? (
					<View style={styles.version}>
						<DotMatrixText text={versionTag} pitch={VERSION_PITCH} color={DIM} />
					</View>
				) : null}
			</View>

			<SettingsMenu
				sensitivity={sensitivity}
				onLevel={() => onCalibrate(colorNow())}
				onSpeed={() => onSpeed(colorNow())}
			/>

			<SoundMenu />
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
	version: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: VERSION_BOTTOM,
		alignItems: "center",
	},
});
