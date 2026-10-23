import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SensorPort } from "../../application/ports";
import { shade, WHITE, whiteAt } from "../theme/theme";
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
 * finished swivel with the arc it swung the phone along. Tap it to clear the list. Each swivel is
 * also logged, for Metro's console.
 */
export function MotionProbe({ sensor }: { sensor: SensorPort }) {
	const insets = useSafeAreaInsets();
	const probe = useRef<ProbeState>(PROBE_START);
	const [shown, setShown] = useState<ProbeState>(PROBE_START);

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

	return (
		<View pointerEvents="box-none" style={[styles.anchor, { paddingTop: insets.top }]}>
			<Pressable onPress={clear} style={styles.panel}>
				<Text style={styles.live}>{describeLive(shown)}</Text>
				{shown.swivels.map((swivel) => (
					<Text key={swivel.endMs} style={styles.swivel}>
						{describeSwivel(swivel)}
					</Text>
				))}
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	anchor: { position: "absolute", top: 0, left: 0, right: 0 },
	panel: { margin: 8, padding: 8, borderRadius: 8, backgroundColor: shade(0.7) },
	live: { color: WHITE, fontSize: 12, fontVariant: ["tabular-nums"] },
	swivel: { color: whiteAt(0.8), fontSize: 12, fontVariant: ["tabular-nums"] },
});
