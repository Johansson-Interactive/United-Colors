import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { DotButton, type PressPoint } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { SettingsMenu } from "../components/SettingsMenu";
import { SoundMenu } from "../components/SoundMenu";
import { RESUME_HINT } from "../flow/pauseHint";
import type { MenuOpening } from "../flow/screenFlow";
import { CAPTION, WHITE } from "../theme/theme";

interface PauseOverlayProps {
	/** QUIT and the corner menus take a press (see pauseContent.ts) */
	pressable: boolean;
	/** It fades in as it mounts (see pauseContent.ts); read only then */
	fadesIn: boolean;
	onQuit: (point: PressPoint) => void;
	/** Extra content below the controls (e.g. dev tools) */
	children?: React.ReactNode;
}

/** The pause's level bowl and speed view open in the player's colour, which the flow knows */
const fromPause = (): MenuOpening => ({ from: "pause" });

/**
 * Paused: the scene frosts over, a calm place to look around, change settings or quit, with the
 * score and run time in the middle (see PausedScore). Its content is already in place as the
 * bloom's portal reveals it, and stays as it is around Get ready's (see pauseContent.ts); only
 * on the pause itself does it take a press. The frost is the way back: a finger held on it,
 * clear of the buttons, opens Get ready (see FieldTouch), so nothing here takes a touch but
 * the buttons, and the caption under PAUSED says so (see pauseHint.ts). The corners hold the
 * settings (level pose and tilt speed) and the sound.
 */
export const PauseOverlay: React.FC<PauseOverlayProps> = ({
	pressable,
	fadesIn,
	onQuit,
	children,
}) => {
	return (
		<Animated.View
			style={styles.container}
			entering={fadesIn ? FadeIn.duration(300) : undefined}
			exiting={FadeOut.duration(200)}
			pointerEvents={pressable ? "box-none" : "none"}
		>
			<View style={styles.top} pointerEvents="none">
				<DotMatrixText text="PAUSED" pitch={8} color={WHITE} glow />
			</View>
			<View style={styles.hint} pointerEvents="none">
				<Text style={CAPTION}>{RESUME_HINT}</Text>
			</View>

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
	hint: {
		alignItems: "center",
		paddingTop: 16,
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
