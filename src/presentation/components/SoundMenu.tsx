import type React from "react";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";
import { WHITE } from "../theme/theme";
import { IconDot } from "./IconDot";

interface SoundMenuProps {
	soundEnabled: boolean;
	musicEnabled: boolean;
	onToggleSound: () => void;
	onToggleMusic: () => void;
	/** Glyph colour while a switch is on */
	color?: string;
}

const MAIN_SIZE = 44;
const ITEM_SIZE = 36;
const OFF = "rgba(244,246,251,0.45)";

/**
 * The sound corner: tapping the sound dot lets two smaller dots rise out of it, one for the
 * music and one for the effects, each toggled with a tap. Tapping anywhere else, or the
 * sound dot again, folds them back in. Fills its parent so the outside tap can close it.
 */
export const SoundMenu: React.FC<SoundMenuProps> = ({
	soundEnabled,
	musicEnabled,
	onToggleSound,
	onToggleMusic,
	color = WHITE,
}) => {
	const [open, setOpen] = useState(false);
	const anyOn = soundEnabled || musicEnabled;
	const items = [
		{
			icon: "music" as const,
			on: musicEnabled,
			onPress: onToggleMusic,
			label: musicEnabled ? "Turn music off" : "Turn music on",
		},
		{
			icon: "effects" as const,
			on: soundEnabled,
			onPress: onToggleSound,
			label: soundEnabled ? "Turn sound effects off" : "Turn sound effects on",
		},
	];

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
			{open ? (
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={() => setOpen(false)}
					accessibilityLabel="Close sound settings"
				/>
			) : null}
			<View style={styles.corner} pointerEvents="box-none">
				{open
					? items.map((item, i) => (
							<Animated.View
								key={item.icon}
								entering={ZoomIn.delay((items.length - 1 - i) * 25)
									.springify()
									.stiffness(900)
									.damping(28)
									.mass(0.5)}
								exiting={ZoomOut.duration(70)}
							>
								<IconDot
									size={ITEM_SIZE}
									icon={item.icon}
									onPress={item.onPress}
									accessibilityLabel={item.label}
									color={item.on ? color : OFF}
									struck={!item.on}
								/>
							</Animated.View>
						))
					: null}
				<IconDot
					size={MAIN_SIZE}
					icon={anyOn ? "sound-on" : "sound-off"}
					onPress={() => setOpen((value) => !value)}
					accessibilityLabel={open ? "Close sound settings" : "Sound settings"}
					color={anyOn ? color : OFF}
				/>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	corner: {
		position: "absolute",
		right: 20,
		bottom: 26,
		alignItems: "center",
		gap: 18,
	},
});
