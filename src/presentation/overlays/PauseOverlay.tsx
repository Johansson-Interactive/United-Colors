import type React from "react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { DotButton, type PressPoint } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { IconDot } from "../components/IconDot";
import { LevelGate } from "../components/LevelGate";
import { SoundMenu } from "../components/SoundMenu";
import { BOWL_SIZE, CAPTION, WHITE } from "../theme/theme";
import type { LevelGatePhase } from "../tilt/levelGate";
import { useTiltAvailable } from "../tilt/useTiltAvailable";

interface PauseOverlayProps {
	/** Player dot colour at the moment of pausing; the level shows it while levelling back in */
	color: string;
	onResume: () => void;
	onQuit: (point: PressPoint) => void;
	/** Open the settle bowl to set the level pose again */
	onCalibrate: () => void;
	soundEnabled: boolean;
	musicEnabled: boolean;
	onToggleSound: () => void;
	onToggleMusic: () => void;
	/** Extra content below the controls (e.g. dev tools) */
	children?: React.ReactNode;
}

/**
 * Paused: the scene frosts over and a spirit level takes the middle. Tipping the bubble out
 * of the inner circle and then holding the phone level resumes, so play restarts from rest;
 * tapping the level resumes immediately. The corners hold the level pose and sound settings.
 */
export const PauseOverlay: React.FC<PauseOverlayProps> = ({
	color,
	onResume,
	onQuit,
	onCalibrate,
	soundEnabled,
	musicEnabled,
	onToggleSound,
	onToggleMusic,
	children,
}) => {
	const tiltAvailable = useTiltAvailable();
	const [gatePhase, setGatePhase] = useState<LevelGatePhase>("leave");
	const caption = !tiltAvailable
		? "tap the ring to resume"
		: gatePhase === "leave"
			? "tip the dot out of the circle\nor tap the ring to continue"
			: "bring it back and hold level\nor tap the ring";
	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(200)}
		>
			<View style={styles.top} pointerEvents="none">
				<DotMatrixText text="PAUSED" pitch={8} color={WHITE} glow />
			</View>

			<View style={styles.centre}>
				<LevelGate
					size={BOWL_SIZE}
					color={color}
					onLevelHeld={onResume}
					onTap={onResume}
					onPhaseChange={setGatePhase}
				/>
				<Text style={styles.caption}>{caption}</Text>
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
					size={44}
					icon="level"
					onPress={onCalibrate}
					accessibilityLabel="Set level pose"
					color={color}
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
	level: {
		position: "absolute",
		left: 20,
		bottom: 26,
	},
});
