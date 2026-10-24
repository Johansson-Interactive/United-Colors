import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SensorPort } from "../../application/ports";
import { BOWL_SIZE, glass, INK, TRIO, WHITE, whiteAt } from "../theme/theme";
import {
	BOWL_TUNING,
	type BowlTuning,
	LEANING_BOWL_START,
	type LeaningBowl,
	stepLeaningBowl,
} from "./leaningBowl";

const DOT_RADIUS = 18;
/** Room the dot keeps from the glass, as Get ready's cup does */
const MARGIN = 6;
const TRAVEL = BOWL_SIZE / 2 - DOT_RADIUS - MARGIN;
const COLOR = TRIO[0];

/** One knob: its value, and the step and limits its buttons move it by */
interface Knob {
	key: keyof BowlTuning;
	label: string;
	step: number;
	min: number;
	max: number;
	format: (value: number) => string;
}

const KNOBS: readonly Knob[] = [
	{ key: "leanMs", label: "lean", step: 250, min: 250, max: 4000, format: (v) => `${v} ms` },
	{ key: "damping", label: "damping", step: 0.1, min: 0.1, max: 1.5, format: (v) => v.toFixed(1) },
];

/**
 * The leaning bowl, full screen over the game in a probe build, with its knobs: a throwaway, to
 * feel and tune before the cup in Get ready leans the same way (see leaningBowl.ts)
 */
export function LeaningBowlPrototype({
	sensor,
	onClose,
}: {
	sensor: SensorPort;
	onClose: () => void;
}) {
	const [tuning, setTuning] = useState<BowlTuning>(BOWL_TUNING);
	/** The tuning as the sample listener reads it, kept in step with what is shown */
	const tuningRef = useRef(tuning);
	const bowl = useRef<LeaningBowl>(LEANING_BOWL_START);
	const [shown, setShown] = useState<LeaningBowl>(LEANING_BOWL_START);

	useEffect(() => {
		const stopListening = sensor.onSample((sample) => {
			bowl.current = stepLeaningBowl(
				bowl.current,
				sample.gravity,
				sample.timeMs,
				tuningRef.current,
				TRAVEL,
			);
		});
		let frame = requestAnimationFrame(function draw() {
			setShown(bowl.current);
			frame = requestAnimationFrame(draw);
		});
		return () => {
			stopListening();
			cancelAnimationFrame(frame);
		};
	}, [sensor]);

	const nudge = (knob: Knob, direction: 1 | -1) => {
		const current = tuningRef.current;
		const value = Math.round((current[knob.key] + direction * knob.step) * 10) / 10;
		const next = { ...current, [knob.key]: Math.min(knob.max, Math.max(knob.min, value)) };
		tuningRef.current = next;
		setTuning(next);
	};

	return (
		<View style={styles.screen}>
			<View style={[styles.bowl, shown.settled && styles.bowlHome]}>
				<View style={styles.seat} />
				<View
					style={[
						styles.dot,
						{ transform: [{ translateX: shown.dot.x }, { translateY: shown.dot.y }] },
					]}
				/>
			</View>
			<Text style={styles.status}>
				{shown.settled ? "home" : "rolling"} settled ×{shown.settles}
			</Text>
			{KNOBS.map((knob) => (
				<View key={knob.key} style={styles.knob}>
					<Pressable onPress={() => nudge(knob, -1)} style={styles.button}>
						<Text style={styles.label}>−</Text>
					</Pressable>
					<Text style={styles.value}>
						{knob.label} {knob.format(tuning[knob.key])}
					</Text>
					<Pressable onPress={() => nudge(knob, 1)} style={styles.button}>
						<Text style={styles.label}>+</Text>
					</Pressable>
				</View>
			))}
			<Pressable onPress={onClose} style={styles.close}>
				<Text style={styles.label}>close</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		...StyleSheet.absoluteFill,
		backgroundColor: INK,
		alignItems: "center",
		justifyContent: "center",
		gap: 16,
	},
	bowl: {
		width: BOWL_SIZE,
		height: BOWL_SIZE,
		borderRadius: BOWL_SIZE / 2,
		borderWidth: 2,
		borderColor: glass(0.25),
		alignItems: "center",
		justifyContent: "center",
	},
	bowlHome: { borderColor: COLOR },
	seat: {
		position: "absolute",
		width: DOT_RADIUS * 2,
		height: DOT_RADIUS * 2,
		borderRadius: DOT_RADIUS,
		borderWidth: 1,
		borderColor: whiteAt(0.3),
	},
	dot: {
		width: DOT_RADIUS * 2,
		height: DOT_RADIUS * 2,
		borderRadius: DOT_RADIUS,
		backgroundColor: COLOR,
	},
	status: { color: WHITE, fontSize: 14, fontVariant: ["tabular-nums"] },
	knob: { flexDirection: "row", alignItems: "center", gap: 16 },
	value: { color: WHITE, fontSize: 14, width: 140, textAlign: "center" },
	button: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: glass(0.12),
		alignItems: "center",
		justifyContent: "center",
	},
	close: {
		paddingHorizontal: 20,
		height: 44,
		borderRadius: 22,
		backgroundColor: glass(0.12),
		justifyContent: "center",
	},
	label: { color: WHITE, fontSize: 16 },
});
