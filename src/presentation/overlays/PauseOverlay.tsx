import type React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface PauseOverlayProps {
	onResume: () => void;
	/** Extra content below the resume button (e.g. dev tools) */
	children?: React.ReactNode;
}

export const PauseOverlay: React.FC<PauseOverlayProps> = ({ onResume, children }) => {
	return (
		<View style={styles.container}>
			<TouchableOpacity style={styles.button} onPress={onResume}>
				<Text style={styles.buttonText}>RESUME</Text>
			</TouchableOpacity>
			{children && <View style={styles.extra}>{children}</View>}
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	button: {
		paddingVertical: 12,
		paddingHorizontal: 20,
		backgroundColor: "transparent",
	},
	buttonText: {
		fontSize: 16,
		color: "#fff",
	},
	extra: {
		marginTop: 48,
	},
});
