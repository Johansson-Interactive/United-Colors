import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SensorPort } from "../../application/ports";
import type { MotionSample } from "../../domain/types";
import { glass, shade, TRIO, WHITE } from "../theme/theme";
import { MotionRecording } from "./motionRecording";
import { describeMotion } from "./probeReadout";

/** How often the readout redraws (ms); the probe itself reads every sample */
const REDRAW_MS = 100;

/** The recording as the readout shows it */
interface Tape {
	on: boolean;
	ms: number;
	samples: number;
}

const NO_TAPE: Tape = { on: false, ms: 0, samples: 0 };

/**
 * The motion probe, drawn over the top of the screen in a probe build: the live motion. Its rec
 * button records the raw samples, up to LONGEST_RECORDING_MS, for share to send off the phone.
 */
export function MotionProbe({ sensor }: { sensor: SensorPort }) {
	const insets = useSafeAreaInsets();
	const latest = useRef<MotionSample | null>(null);
	const [shown, setShown] = useState<MotionSample | null>(null);
	// The take under way or the last one; null before the first
	const recording = useRef<MotionRecording | null>(null);
	const recordingOn = useRef(false);
	const [tape, setTape] = useState<Tape>(NO_TAPE);

	useEffect(() => {
		const stopListening = sensor.onSample((sample) => {
			latest.current = sample;
			const take = recording.current;
			if (recordingOn.current && take) {
				take.record(sample);
				if (take.full) recordingOn.current = false;
			}
		});
		const redraw = setInterval(() => {
			setShown(latest.current);
			setTape({
				on: recordingOn.current,
				ms: recording.current?.ms ?? 0,
				samples: recording.current?.samples ?? 0,
			});
		}, REDRAW_MS);
		return () => {
			stopListening();
			clearInterval(redraw);
		};
	}, [sensor]);

	const toggleRecording = () => {
		if (!recordingOn.current) recording.current = new MotionRecording();
		recordingOn.current = !recordingOn.current;
	};

	const share = () => {
		const take = recording.current;
		if (take) void Share.share({ message: take.text(Platform.OS) });
	};

	return (
		<View pointerEvents="box-none" style={[styles.anchor, { paddingTop: insets.top }]}>
			<View style={styles.panel}>
				<View style={styles.header}>
					<Text style={styles.live}>{describeMotion(shown)}</Text>
				</View>
				<View style={styles.buttons}>
					<Pressable onPress={toggleRecording} style={[styles.button, tape.on && styles.recording]}>
						<Text style={styles.live}>
							{tape.on ? `stop ${Math.floor(tape.ms / 1000)} s` : "rec"}
						</Text>
					</Pressable>
					{!tape.on && tape.samples > 0 && (
						<Pressable onPress={share} style={styles.button}>
							<Text style={styles.live}>share {Math.floor(tape.ms / 1000)} s</Text>
						</Pressable>
					)}
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	anchor: { position: "absolute", top: 0, left: 0, right: 0 },
	panel: {
		margin: 8,
		padding: 8,
		borderRadius: 8,
		backgroundColor: shade(0.7),
	},
	header: { marginBottom: 4 },
	buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginBottom: 4 },
	live: { color: WHITE, fontSize: 12, fontVariant: ["tabular-nums"] },
	recording: { backgroundColor: TRIO[0] },
	button: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 16,
		backgroundColor: glass(0.15),
	},
});
