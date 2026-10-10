import { BlurMask, Canvas, Circle, Group, RadialGradient, vec } from "@shopify/react-native-skia";
import type React from "react";
import { useCallback } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { layoutDotMatrix, pitchToFit } from "../dotmatrix/layout";
import { WHITE } from "../theme/theme";
import { useTilt } from "../tilt/TiltProvider";
import { DotMatrixText } from "./DotMatrixText";

export interface PressPoint {
	/** Window coordinates of the touch, for transitions that grow from the finger */
	x: number;
	y: number;
}

interface DotButtonProps {
	/** Diameter in px */
	size: number;
	color: string | SharedValue<string>;
	label?: string;
	/** Preferred pitch of the label's dot-matrix text (defaults from the size); shrunk to fit */
	labelPitch?: number;
	/** "solid" is a game dot; "ghost" is an outlined ring */
	variant?: "solid" | "ghost";
	onPress: (point: PressPoint) => void;
	accessibilityLabel: string;
	/** Custom Skia content drawn inside the dot (icons) */
	children?: React.ReactNode;
	disabled?: boolean;
}

/**
 * Canvas margin around the dot, as a fraction of the radius. Must hold the pressed glow
 * (radius 1.2r, blur sigma 0.42r, ~3 sigma of falloff) or the blur is clipped to a square.
 */
export const GLOW_PAD = 1.5;
/** Widest a label may be, as a fraction of the diameter, so it sits clear of the rim */
const LABEL_MAX_WIDTH = 0.66;
/** Glare centre offset per radian of tilt (fraction of the radius) */
const GLARE_TILT_GAIN = 0.4;

/**
 * A button that is a dot. Solid dots look like the player's dot: lit glass with a glare
 * that follows the device tilt and a glow that brightens on touch. Ghost dots are thin
 * rings for secondary actions.
 */
export const DotButton: React.FC<DotButtonProps> = ({
	size,
	color,
	label,
	labelPitch,
	variant = "solid",
	onPress,
	accessibilityLabel,
	children,
	disabled = false,
}) => {
	const tilt = useTilt();
	const radius = size / 2;
	const pad = radius * GLOW_PAD;
	const canvasSize = size + pad * 2;
	const centre = radius + pad;
	const pressed = useSharedValue(0);

	const fill = useDerivedValue(() => (typeof color === "string" ? color : color.get()));
	const glowRadius = useDerivedValue(() => radius * (1.08 + pressed.get() * 0.12));
	const glowBlur = useDerivedValue(() => radius * (0.32 + pressed.get() * 0.1));
	const glowOpacity = useDerivedValue(() => 0.55 + pressed.get() * 0.35);
	const glareCentre = useDerivedValue(() =>
		vec(
			centre + radius * Math.max(-0.5, Math.min(0.5, -0.28 - tilt.x.get() * GLARE_TILT_GAIN)),
			centre + radius * Math.max(-0.5, Math.min(0.5, -0.28 - tilt.y.get() * GLARE_TILT_GAIN)),
		),
	);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: 1 - pressed.get() * 0.08 }],
	}));

	const handlePressIn = useCallback(() => {
		pressed.set(withTiming(1, { duration: 90 }));
	}, [pressed]);
	const handlePressOut = useCallback(() => {
		pressed.set(withSpring(0, { damping: 12, stiffness: 220 }));
	}, [pressed]);
	const handlePress = useCallback(
		(event: GestureResponderEvent) => {
			onPress({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
		},
		[onPress],
	);

	const pitch = label
		? pitchToFit(
				layoutDotMatrix(label),
				size * LABEL_MAX_WIDTH,
				labelPitch ?? Math.max(3, Math.round(size / 26)),
			)
		: 0;
	const labelColor = variant === "solid" ? WHITE : fill;

	return (
		<Animated.View style={[{ width: size, height: size }, animatedStyle]}>
			<Canvas
				style={{
					position: "absolute",
					left: -pad,
					top: -pad,
					width: canvasSize,
					height: canvasSize,
				}}
				pointerEvents="none"
			>
				{variant === "solid" ? (
					<>
						<Group opacity={glowOpacity}>
							<Circle cx={centre} cy={centre} r={glowRadius} color={fill}>
								<BlurMask blur={glowBlur} style="normal" />
							</Circle>
						</Group>
						<Circle cx={centre} cy={centre} r={radius} color={fill} />
						<Circle cx={centre} cy={centre} r={radius}>
							<RadialGradient
								c={glareCentre}
								r={radius * 0.8}
								colors={["rgba(255,255,255,0.5)", "rgba(255,255,255,0)"]}
							/>
						</Circle>
					</>
				) : (
					<>
						<Circle cx={centre} cy={centre} r={radius} color="rgba(255,255,255,0.04)" />
						<Circle
							cx={centre}
							cy={centre}
							r={radius - 1}
							color={fill}
							style="stroke"
							strokeWidth={2}
							opacity={0.85}
						/>
					</>
				)}
				{children}
			</Canvas>
			<View style={styles.labelWrap} pointerEvents="none">
				{label ? <DotMatrixText text={label} pitch={pitch} color={labelColor} /> : null}
			</View>
			<Pressable
				style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
				onPressIn={handlePressIn}
				onPressOut={handlePressOut}
				onPress={handlePress}
				disabled={disabled}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				hitSlop={8}
			/>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	labelWrap: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
	},
});
