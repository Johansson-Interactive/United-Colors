import { Canvas, Circle, Path, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
	interpolateColor,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { GREEN, WHITE } from "../theme/theme";
import { useTilt } from "../tilt/TiltProvider";

interface LevelGateProps {
	size: number;
	/** Fired once when the device has been held level long enough */
	onLevelHeld: () => void;
	/** Fired when the gate is tapped (always available as a fallback) */
	onTap: () => void;
}

/** Tilt (radians, either axis) that still counts as level */
const LEVEL_RAD = 0.11;
/** How long the device must stay level */
const HOLD_MS = 900;
/** Ignore the first moments after pausing so the hand can settle */
const ARM_MS = 700;
const BUBBLE_GAIN = 150;

/**
 * A spirit level. The bubble follows the tilt; hold the phone level and the ring fills,
 * then the game resumes with the dot at rest instead of flying off. Tapping resumes at once.
 */
export const LevelGate: React.FC<LevelGateProps> = ({ size, onLevelHeld, onTap }) => {
	const tilt = useTilt();
	const centre = size / 2;
	const rim = centre - 4;
	const target = size * 0.17;
	const bubble = size * 0.085;
	const travel = rim - bubble - 2;

	const progress = useSharedValue(0);
	const armed = useSharedValue(0);
	const fired = useSharedValue(false);
	const level = useSharedValue(false);

	useFrameCallback((info) => {
		const dt = info.timeSincePreviousFrame ?? 16;
		if (armed.value < ARM_MS) {
			armed.value += dt;
			return;
		}
		const isLevel =
			tilt.available.value &&
			Math.abs(tilt.x.value) < LEVEL_RAD &&
			Math.abs(tilt.y.value) < LEVEL_RAD;
		level.value = isLevel;
		if (isLevel) {
			progress.value = Math.min(1, progress.value + dt / HOLD_MS);
		} else {
			progress.value = Math.max(0, progress.value - dt / (HOLD_MS * 0.4));
		}
		if (progress.value >= 1 && !fired.value) {
			fired.value = true;
			scheduleOnRN(onLevelHeld);
		}
	});

	const bubblePos = useDerivedValue(() => {
		let x = tilt.x.value * BUBBLE_GAIN;
		let y = tilt.y.value * BUBBLE_GAIN;
		const d = Math.hypot(x, y);
		if (d > travel) {
			x = (x / d) * travel;
			y = (y / d) * travel;
		}
		return { x: centre + x, y: centre + y };
	});
	const bubbleX = useDerivedValue(() => bubblePos.value.x);
	const bubbleY = useDerivedValue(() => bubblePos.value.y);
	const bubbleColor = useDerivedValue(() =>
		interpolateColor(level.value ? 1 : 0, [0, 1], [WHITE, GREEN]),
	);
	const targetColor = useDerivedValue(() =>
		level.value ? "rgba(139,195,74,0.9)" : "rgba(255,255,255,0.25)",
	);
	const arc = useDerivedValue(() => {
		const path = Skia.Path.Make();
		const sweep = 360 * progress.value;
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
				<Path path={arc} color={GREEN} style="stroke" strokeWidth={4} strokeCap="round" />
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
