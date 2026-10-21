import {
	BlurMask,
	Canvas,
	Circle,
	Group,
	RadialGradient,
	Rect,
	Shader,
	Skia,
	vec,
} from "@shopify/react-native-skia";
import type React from "react";
import { useCallback } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, View } from "react-native";
import Animated, {
	convertToRGBA,
	type SharedValue,
	useAnimatedStyle,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { JELLY_AT_REST, jellyShape, stepJelly } from "../../application/jelly";
import { layoutDotMatrix, pitchToFit } from "../dotmatrix/layout";
import { DROP_SKSL } from "../liquidShader";
import { glass, WHITE } from "../theme/theme";

/** The glare across a solid dot, and the faint fill of a ghost one */
const GLARE = [glass(0.5), glass(0)];
const GHOST_FILL = glass(0.04);

import { useTilt } from "../tilt/TiltProvider";
import { DotMatrixText } from "./DotMatrixText";
import { useBowlOffset } from "./TiltBowl";

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
	/**
	 * A solid dot made of the player's liquid: it sloshes as it rolls in a TiltBowl and
	 * ripples at rest, so the button already feels like the dot you will play
	 */
	liquid?: boolean;
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
/** Longest frame (ms) the liquid integrates, so a stall does not kick it */
const LIQUID_MAX_FRAME_MS = 100;

const DROP_EFFECT = Skia.RuntimeEffect.Make(DROP_SKSL);
if (!DROP_EFFECT) throw new Error("drop shader failed to compile");

/** The drop shader's uniforms for a dot that is not liquid, which never draws them */
const NO_COLOR: [number, number, number, number] = [0, 0, 0, 0];
const NO_DROP = {
	center: vec(0, 0),
	radius: 0,
	jelly: [0, 0, 0],
	color: NO_COLOR,
	glare: [0, 0, 0],
};

/**
 * A button that is a dot. Solid dots look like the player's dot: lit glass with a glare
 * that follows the device tilt and a glow that brightens on touch. Ghost dots are thin
 * rings for secondary actions. A liquid dot is a drop of the player's own liquid.
 */
export const DotButton: React.FC<DotButtonProps> = ({
	size,
	color,
	label,
	labelPitch,
	variant = "solid",
	liquid = false,
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
	// Only a solid dot has a glare; a ghost ring reads a still tilt, so it never re-runs this
	const still = useSharedValue(0);
	const glareTiltX = variant === "solid" ? tilt.x : still;
	const glareTiltY = variant === "solid" ? tilt.y : still;
	const glareCentre = useDerivedValue(() =>
		vec(
			centre + radius * Math.max(-0.5, Math.min(0.5, -0.28 - glareTiltX.get() * GLARE_TILT_GAIN)),
			centre + radius * Math.max(-0.5, Math.min(0.5, -0.28 - glareTiltY.get() * GLARE_TILT_GAIN)),
		),
	);

	// The liquid follows the bowl's roll (or sits still outside one) and keeps rippling
	const bowl = useBowlOffset();
	const body = useSharedValue(JELLY_AT_REST);
	useFrameCallback((info) => {
		const dt = Math.min(LIQUID_MAX_FRAME_MS, info.timeSincePreviousFrame ?? 0);
		const at = bowl?.get() ?? { x: 0, y: 0 };
		body.set(stepJelly(body.get(), at.x, at.y, radius, dt));
	}, liquid);
	// The liquid ripples every frame, but its colour only changes now and then: parse it then
	const liquidColor = useDerivedValue(() => (liquid ? convertToRGBA(fill.get()) : NO_COLOR));
	const dropUniforms = useDerivedValue(() => {
		if (!liquid) return NO_DROP;
		const shape = jellyShape(body.get(), radius);
		const glare = glareCentre.get();
		return {
			center: vec(centre, centre),
			radius,
			jelly: [shape.stretchX, shape.stretchY, shape.wobble],
			color: liquidColor.get(),
			glare: [glare.x, glare.y, radius * 0.8],
		};
	});

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
						{liquid ? (
							<Rect x={0} y={0} width={canvasSize} height={canvasSize}>
								<Shader source={DROP_EFFECT} uniforms={dropUniforms} />
							</Rect>
						) : (
							<>
								<Circle cx={centre} cy={centre} r={radius} color={fill} />
								<Circle cx={centre} cy={centre} r={radius}>
									<RadialGradient c={glareCentre} r={radius * 0.8} colors={GLARE} />
								</Circle>
							</>
						)}
					</>
				) : (
					<>
						<Circle cx={centre} cy={centre} r={radius} color={GHOST_FILL} />
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
