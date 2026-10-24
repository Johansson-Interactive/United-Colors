import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SensorPort } from "../../application/ports";
import { glass, shade, WHITE, whiteAt } from "../theme/theme";
import { LeaningBowlPrototype } from "./LeaningBowlPrototype";
import {
	clearProbe,
	describeLive,
	describeSwivel,
	PROBE_START,
	type ProbeState,
	stepProbe,
} from "./probeReadout";

/** How often the readout redraws (ms); the probe itself reads every sample */
const REDRAW_MS = 100;

/**
 * The motion probe, drawn over the top of the screen in a probe build: the live motion, and each
 * finished swivel with the arc it swung the phone along and whether it was called a turn on the
 * spot. Tap it to clear the list. Each swivel is also logged, for Metro's console. Its bowl
 * button opens the leaning bowl prototype.
 */
export function MotionProbe({ sensor }: { sensor: SensorPort }) {
	const insets = useSafeAreaInsets();
	const probe = useRef<ProbeState>(PROBE_START);
	const [shown, setShown] = useState<ProbeState>(PROBE_START);
	const [bowlOpen, setBowlOpen] = useState(false);

	useEffect(() => {
		const stopListening = sensor.onSample((sample) => {
			const { state, ended } = stepProbe(probe.current, sample);
			probe.current = state;
			if (ended) console.log(`[probe] swivel ${JSON.stringify(ended)}`);
		});
		const redraw = setInterval(() => setShown(probe.current), REDRAW_MS);
		return () => {
			stopListening();
			clearInterval(redraw);
		};
	}, [sensor]);

	const clear = () => {
		probe.current = clearProbe(probe.current);
		setShown(probe.current);
	};

	if (bowlOpen) return <LeaningBowlPrototype sensor={sensor} onClose={() => setBowlOpen(false)} />;

	return (
		<View
			pointerEvents="box-none"
			style={[styles.anchor, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
		>
			<Pressable onPress={clear} style={styles.panel}>
				<View style={styles.header}>
					<Text style={styles.live}>{describeLive(shown)}</Text>
					<Pressable onPress={() => setBowlOpen(true)} style={styles.bowlButton}>
						<Text style={styles.live}>bowl</Text>
					</Pressable>
				</View>
				{shown.swivels.map((swivel) => (
					<Text key={swivel.endMs} numberOfLines={1} style={styles.swivel}>
						{describeSwivel(swivel)}
					</Text>
				))}
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	// The whole screen's height, so a long list grows down to its foot and no further
	anchor: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
	panel: {
		flexShrink: 1,
		overflow: "hidden",
		margin: 8,
		padding: 8,
		borderRadius: 8,
		backgroundColor: shade(0.7),
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	live: { color: WHITE, fontSize: 12, fontVariant: ["tabular-nums"] },
	swivel: { color: whiteAt(0.8), fontSize: 11, lineHeight: 15, fontVariant: ["tabular-nums"] },
	bowlButton: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 16,
		backgroundColor: glass(0.15),
	},
});
