import type React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { DotButton, type PressPoint } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { IconDot } from "../components/IconDot";
import { SoundMenu } from "../components/SoundMenu";
import { CORNER_DOT_SIZE, CORNER_INSET, WHITE } from "../theme/theme";
import { sensitivityChoice } from "../tilt/sensitivity";

interface PauseOverlayProps {
	/** Player dot colour at the moment of pausing; the level pose button wears it */
	color: string;
	onQuit: (point: PressPoint) => void;
	/** Open the settle bowl to set the level pose again */
	onCalibrate: () => void;
	soundEnabled: boolean;
	musicEnabled: boolean;
	onToggleSound: () => void;
	onToggleMusic: () => void;
	/** Tilt sensitivity, a multiple of the default speed; the speed button shows it */
	sensitivity: number;
	/** Open the speed view to choose how fast the dot moves */
	onSpeed: () => void;
	/** Extra content below the controls (e.g. dev tools) */
	children?: React.ReactNode;
}

/**
 * Paused: the scene frosts over, a calm place to look around, change settings or quit. The
 * HUD's corner dot, a play dot here, carries on through Get ready. The corners hold the level
 * pose, the tilt speed and the sound settings.
 */
export const PauseOverlay: React.FC<PauseOverlayProps> = ({
	color,
	onQuit,
	onCalibrate,
	soundEnabled,
	musicEnabled,
	onToggleSound,
	onToggleMusic,
	sensitivity,
	onSpeed,
	children,
}) => {
	const speed = sensitivityChoice(sensitivity);
	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(200)}
		>
			<View style={styles.top} pointerEvents="none">
				<DotMatrixText text="PAUSED" pitch={8} color={WHITE} glow />
			</View>

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

			<View style={styles.level}>
				<IconDot
					size={CORNER_DOT_SIZE}
					icon="level"
					onPress={onCalibrate}
					accessibilityLabel="Set level pose"
					color={color}
				/>
			</View>

			<View style={styles.speed}>
				<IconDot
					size={CORNER_DOT_SIZE}
					icon={`speed-${speed.key}`}
					onPress={onSpeed}
					accessibilityLabel={`Tilt speed, ${speed.label.toLowerCase()}`}
					color={WHITE}
				/>
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
	level: {
		position: "absolute",
		left: CORNER_INSET,
		bottom: 26,
	},
	speed: {
		position: "absolute",
		left: CORNER_INSET + CORNER_DOT_SIZE + 18,
		bottom: 26,
	},
});
