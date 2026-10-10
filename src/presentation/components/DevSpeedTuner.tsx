import type React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GREEN } from "../theme/theme";

interface DevSpeedTunerProps {
	/** Player speed in px/s per degree of tilt */
	value: number;
	/** Same speed as PLAYER_DOT_SPEED_RATIO, to copy into constants once tuned */
	ratio: number;
	onChange: (pxPerSecondPerDegree: number) => void;
}

const STEP = 2;
const MIN = 2;

/** Dev only: live player speed tuning. Copy the ratio into PLAYER_DOT_SPEED_RATIO. */
export const DevSpeedTuner: React.FC<DevSpeedTunerProps> = ({ value, ratio, onChange }) => (
	<View style={styles.container}>
		<Text style={styles.label}>DEV · SPEED PER DEGREE OF TILT</Text>
		<View style={styles.row}>
			<Pressable
				style={styles.button}
				onPress={() => onChange(Math.max(MIN, value - STEP))}
				accessibilityLabel="Decrease speed"
			>
				<Text style={styles.buttonText}>−</Text>
			</Pressable>
			<Text style={styles.value}>{Math.round(value)} px/s/°</Text>
			<Pressable
				style={styles.button}
				onPress={() => onChange(value + STEP)}
				accessibilityLabel="Increase speed"
			>
				<Text style={styles.buttonText}>+</Text>
			</Pressable>
		</View>
		<Text style={styles.hint}>PLAYER_DOT_SPEED_RATIO = {ratio.toFixed(4)}</Text>
	</View>
);

const styles = StyleSheet.create({
	container: {
		alignItems: "center",
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 20,
		backgroundColor: "rgba(255,255,255,0.05)",
		borderWidth: 1,
		borderColor: "rgba(139,195,74,0.35)",
	},
	label: {
		fontSize: 10,
		letterSpacing: 2,
		color: GREEN,
		marginBottom: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
	},
	button: {
		width: 40,
		height: 40,
		borderRadius: 20,
		borderWidth: 1.5,
		borderColor: GREEN,
		justifyContent: "center",
		alignItems: "center",
	},
	buttonText: {
		fontSize: 20,
		color: GREEN,
	},
	value: {
		minWidth: 90,
		textAlign: "center",
		fontSize: 15,
		color: "#F4F6FB",
		fontVariant: ["tabular-nums"],
	},
	hint: {
		marginTop: 8,
		fontSize: 10,
		color: "rgba(244,246,251,0.55)",
	},
});
