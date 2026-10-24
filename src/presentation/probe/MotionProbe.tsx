import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SensorPort } from "../../application/ports";
import { glass, shade, TRIO, WHITE, whiteAt } from "../theme/theme";
import { LeaningBowlPrototype } from "./LeaningBowlPrototype";
import {
	EMPTY_RECORDING,
	type MotionRecording,
	recordedMs,
	recordingText,
	recordSample,
} from "./motionRecording";
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

/** The recording as the readout shows it */
interface Tape {
	on: boolean;
	ms: number;
	samples: number;
}

const NO_TAPE: Tape = { on: false, ms: 0, samples: 0 };

/**
 * The motion probe, drawn over the top of the screen in a probe build: the live motion, and each
 * finished swivel with the arc it swung the phone along and whether it was called a turn on the
 * spot. Tap it to clear the list. Each swivel is also logged, for Metro's console. Its rec
 * button records the raw samples, up to LONGEST_RECORDING_MS, for share to send off the phone;
 * its bowl button opens the leaning bowl prototype.
 */
export function MotionProbe({ sensor }: { sensor: SensorPort }) {
	const insets = useSafeAreaInsets();
	const probe = useRef<ProbeState>(PROBE_START);
	const [shown, setShown] = useState<ProbeState>(PROBE_START);
	const [bowlOpen, setBowlOpen] = useState(false);
	const recording = useRef<MotionRecording>(EMPTY_RECORDING);
	const recordingOn = useRef(false);
	const [tape, setTape] = useState<Tape>(NO_TAPE);

	useEffect(() => {
		const stopListening = sensor.onSample((sample) => {
			const { state, ended } = stepProbe(probe.current, sample);
			probe.current = state;
			if (ended) console.log(`[probe] swivel ${JSON.stringify(ended)}`);
			if (recordingOn.current) {
				recording.current = recordSample(recording.current, sample);
				if (recording.current.full) recordingOn.current = false;
			}
		});
		const redraw = setInterval(() => {
			setShown(probe.current);
			setTape({
				on: recordingOn.current,
				ms: recordedMs(recording.current),
				samples: recording.current.rows.length,
			});
		}, REDRAW_MS);
		return () => {
			stopListening();
			clearInterval(redraw);
		};
	}, [sensor]);

	const clear = () => {
		probe.current = clearProbe(probe.current);
		setShown(probe.current);
	};

	const toggleRecording = () => {
		if (!recordingOn.current) recording.current = EMPTY_RECORDING;
		recordingOn.current = !recordingOn.current;
	};

	const share = () => {
		void Share.share({ message: recordingText(recording.current, Platform.OS) });
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
					<Pressable onPress={() => setBowlOpen(true)} style={styles.button}>
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
	header: { marginBottom: 4 },
	buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginBottom: 4 },
	live: { color: WHITE, fontSize: 12, fontVariant: ["tabular-nums"] },
	swivel: { color: whiteAt(0.8), fontSize: 11, lineHeight: 15, fontVariant: ["tabular-nums"] },
	recording: { backgroundColor: TRIO[0] },
	button: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 16,
		backgroundColor: glass(0.15),
	},
});
