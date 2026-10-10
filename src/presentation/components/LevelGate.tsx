import { Canvas, Circle, Path, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { WHITE } from "../theme/theme";
import { INITIAL_LEVEL_GATE, isLevel, type LevelGatePhase, stepLevelGate } from "../tilt/levelGate";
import { useTilt } from "../tilt/TiltProvider";

interface LevelGateProps {
	size: number;
	/** Bubble, target and fill colour while levelling back in (the player's colour) */
	color: string;
	/** Fired once when the device has been held level long enough */
	onLevelHeld: () => void;
	/** Fired when the gate is tapped (always available as a fallback) */
	onTap: () => void;
	/** Fired when the gate moves between "tip out" and "bring back" (for captions) */
	onPhaseChange?: (phase: LevelGatePhase) => void;
}

const BUBBLE_GAIN = 150;

/**
 * A spirit level. The bubble follows the tilt; tip it out of the inner circle, then bring it
 * back and hold level until the ring fills, so the game resumes with the dot at rest instead of
 * flying off (and pausing mid-play, already level, can't resume by itself). Tapping resumes at once.
 */
export const LevelGate: React.FC<LevelGateProps> = ({
	size,
	color,
	onLevelHeld,
	onTap,
	onPhaseChange,
}) => {
	const tilt = useTilt();
	const centre = size / 2;
	// Inset by half the progress arc's stroke so it isn't clipped
	const rim = centre - 2;
	const target = size * 0.17;
	const bubble = size * 0.085;
	const travel = rim - bubble - 2;

	// Bubble centre crossing the inner circle counts as leaving it
	const leaveRad = target / BUBBLE_GAIN;

	const gate = useSharedValue(INITIAL_LEVEL_GATE);
	const progress = useDerivedValue(() => gate.get().progress);
	// Only highlight "level" once the bubble has been out, so a centred bubble isn't misread
	const level = useDerivedValue(
		() =>
			gate.get().phase === "return" && tilt.available.get() && isLevel(tilt.x.get(), tilt.y.get()),
	);

	useFrameCallback((info) => {
		if (!tilt.available.get()) return;
		const dt = info.timeSincePreviousFrame ?? 16;
		const prev = gate.get();
		const next = stepLevelGate(prev, tilt.x.get(), tilt.y.get(), dt, leaveRad);
		if (next === prev) return;
		gate.set(next);
		if (next.phase !== prev.phase && onPhaseChange) scheduleOnRN(onPhaseChange, next.phase);
		if (next.fired && !prev.fired) scheduleOnRN(onLevelHeld);
	});

	const bubblePos = useDerivedValue(() => {
		let x = tilt.x.get() * BUBBLE_GAIN;
		let y = tilt.y.get() * BUBBLE_GAIN;
		const d = Math.hypot(x, y);
		if (d > travel) {
			x = (x / d) * travel;
			y = (y / d) * travel;
		}
		return { x: centre + x, y: centre + y };
	});
	const bubbleX = useDerivedValue(() => bubblePos.get().x);
	const bubbleY = useDerivedValue(() => bubblePos.get().y);
	const bubbleColor = useDerivedValue(() => (level.get() ? color : WHITE));
	const targetColor = useDerivedValue(() => (level.get() ? color : "rgba(255,255,255,0.25)"));
	const arc = useDerivedValue(() => {
		const path = Skia.Path.Make();
		const sweep = 360 * progress.get();
		if (sweep > 0) {
			path.addArc(Skia.XYWHRect(centre - rim, centre - rim, rim * 2, rim * 2), -90, sweep);
		}
		return path;
	});

	const handlePress = useCallback(() => onTap(), [onTap]);

	return (
		<View style={{ width: size, height: size }}>
			<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
				<Circle cx={centre} cy={centre} r={rim} color="rgba(255,255,255,0.03)" />
				<Circle
					cx={centre}
					cy={centre}
					r={rim}
					color="rgba(255,255,255,0.14)"
					style="stroke"
					strokeWidth={2}
				/>
				<Path path={arc} color={color} style="stroke" strokeWidth={4} strokeCap="round" />
				<Circle
					cx={centre}
					cy={centre}
					r={target}
					color={targetColor}
					style="stroke"
					strokeWidth={1.5}
				/>
				<Circle cx={bubbleX} cy={bubbleY} r={bubble * 1.9} color="rgba(255,255,255,0.08)" />
				<Circle cx={bubbleX} cy={bubbleY} r={bubble} color={bubbleColor} />
			</Canvas>
			<Pressable
				style={[StyleSheet.absoluteFill, { borderRadius: centre }]}
				onPress={handlePress}
				accessibilityRole="button"
				accessibilityLabel="Resume"
			/>
		</View>
	);
};
