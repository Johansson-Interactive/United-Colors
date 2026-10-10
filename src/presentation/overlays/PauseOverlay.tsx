import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";
import { DotButton, type PressPoint } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { IconDot } from "../components/IconDot";
import { LevelGate } from "../components/LevelGate";
import { CAPTION, WHITE } from "../theme/theme";
import { useTiltAvailable } from "../tilt/useTiltAvailable";

interface PauseOverlayProps {
	onResume: () => void;
	onQuit: (point: PressPoint) => void;
	soundEnabled: boolean;
	onToggleSound: () => void;
	/** Extra content below the controls (e.g. dev tools) */
	children?: React.ReactNode;
}

/**
 * Paused: the scene frosts over and a spirit level takes the middle. Holding the phone
 * level resumes, so play restarts from rest; tapping the level resumes immediately.
 */
export const PauseOverlay: React.FC<PauseOverlayProps> = ({
	onResume,
	onQuit,
	soundEnabled,
	onToggleSound,
	children,
}) => {
	const tiltAvailable = useTiltAvailable();
	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(200)}
		>
			<View style={styles.top} pointerEvents="none">
				<DotMatrixText text="PAUSED" pitch={8} color={WHITE} glow />
			</View>

			<Animated.View style={styles.centre} entering={ZoomIn.springify().damping(14)}>
				<LevelGate size={220} onLevelHeld={onResume} onTap={onResume} />
				<Text style={styles.caption}>
					{tiltAvailable ? "hold level to resume\nor tap the ring" : "tap the ring to resume"}
				</Text>
			</Animated.View>

			<View style={styles.footer}>
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

			<View style={styles.sound}>
				<IconDot
					size={44}
					icon={soundEnabled ? "sound-on" : "sound-off"}
					onPress={onToggleSound}
					accessibilityLabel={soundEnabled ? "Mute sound" : "Unmute sound"}
					color={soundEnabled ? WHITE : "rgba(244,246,251,0.45)"}
				/>
			</View>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFillObject,
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
	caption: {
		...CAPTION,
		lineHeight: 20,
	},
	footer: {
		alignItems: "center",
		paddingBottom: 44,
		gap: 20,
	},
	extra: {
		alignItems: "center",
	},
	sound: {
		position: "absolute",
		right: 20,
		bottom: 26,
	},
});
