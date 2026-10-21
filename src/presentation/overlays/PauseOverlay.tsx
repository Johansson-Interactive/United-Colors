import type React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { DotButton, type PressPoint } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { SettingsMenu } from "../components/SettingsMenu";
import { SoundMenu } from "../components/SoundMenu";
import { SINK_MS } from "../effects/scoreSink";
import type { MenuOpening } from "../flow/screenFlow";
import { WHITE } from "../theme/theme";

interface PauseOverlayProps {
	onQuit: (point: PressPoint) => void;
	/** Extra content below the controls (e.g. dev tools) */
	children?: React.ReactNode;
}

/** The pause's level bowl and speed view open in the player's colour, which the flow knows */
const fromPause = (): MenuOpening => ({ from: "pause" });

/** PAUSED waits until the sinking score has cleared its band at the top (ms) */
const CAPTION_DELAY_MS = SINK_MS * 0.6;

/**
 * Paused: the scene frosts over, a calm place to look around, change settings or quit. The
 * score sinks into the middle with the run time under it (see PausedScore). The frost itself
 * is the way back: a finger held on it, clear of the buttons, opens Get ready (see FieldTouch),
 * so nothing here takes a touch but the buttons. The corners hold the settings (level pose and
 * tilt speed) and the sound.
 */
export const PauseOverlay: React.FC<PauseOverlayProps> = ({ onQuit, children }) => {
	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(200)}
			pointerEvents="box-none"
		>
			<Animated.View
				style={styles.top}
				pointerEvents="none"
				entering={FadeIn.delay(CAPTION_DELAY_MS).duration(300)}
			>
				<DotMatrixText text="PAUSED" pitch={8} color={WHITE} glow />
			</Animated.View>

			<View style={styles.footer} pointerEvents="box-none">
				<DotButton
					size={80}
					color={WHITE}
					variant="ghost"
					label="QUIT"
					labelPitch={3}
					onPress={onQuit}
					accessibilityLabel="Quit to menu"
				/>
				{children ? <View style={styles.extra}>{children}</View> : null}
			</View>

			<SettingsMenu openingAt={fromPause} />

			<SoundMenu />
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
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		paddingBottom: 44,
		gap: 20,
	},
	extra: {
		alignItems: "center",
	},
});
