import type React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
		padding: 12,
		borderRadius: 8,
		backgroundColor: "rgba(0,0,0,0.6)",
	},
	label: {
		fontSize: 12,
		letterSpacing: 1,
		color: "#8BC34A",
		marginBottom: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
	},
	button: {
		width: 44,
		height: 44,
		borderRadius: 22,
		borderWidth: 1.5,
		borderColor: "#8BC34A",
		justifyContent: "center",
		alignItems: "center",
	},
	buttonText: {
		fontSize: 22,
		color: "#8BC34A",
	},
	value: {
		minWidth: 90,
		textAlign: "center",
		fontSize: 16,
		color: "#fff",
		fontVariant: ["tabular-nums"],
	},
	hint: {
		marginTop: 8,
		fontSize: 11,
		color: "rgba(255,255,255,0.7)",
	},
});
