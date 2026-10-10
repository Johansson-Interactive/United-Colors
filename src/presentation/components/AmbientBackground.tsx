import { Canvas, createPicture, Picture, Skia, TileMode, vec } from "@shopify/react-native-skia";
import type React from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import {
	type SharedValue,
	useAnimatedReaction,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import { INK } from "../theme/theme";
import { useTilt } from "../tilt/TiltProvider";

/** Stop positions for the eased ramps; enough that the curve reads smooth, not piecewise */
const RAMP = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Light pool: bright centre easing out to nothing, no hard rim where a linear fade ends */
const LIGHT_PEAK = 0.075;
const LIGHT_ALPHAS = RAMP.map((t) => LIGHT_PEAK * (1 - smoothstep(t)));

/** Edge wash: clear across the middle, easing in toward the corners */
const WASH_START = 0.55;
const WASH_PEAK = 0.26;
const WASH_POSITIONS = [0, ...RAMP.map((t) => WASH_START + t * (1 - WASH_START))];
const WASH_ALPHAS = [0, ...RAMP.map((t) => WASH_PEAK * smoothstep(t))];

interface AmbientBackgroundProps {
	/** Colour washed into the screen edges (the player's colour while playing) */
	accent: SharedValue<string>;
	/** While frosted (> 0) the light stops tracking the tilt so a still scene stays still */
	frost: SharedValue<number>;
}

/**
 * The room the dots live in: ink, a soft pool of light that slides against the tilt as if
 * the phone were lit from above, and an edge wash in the accent colour. Fills the whole
 * window, behind the playfield, so safe-area bands are part of the picture.
 */
export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ accent, frost }) => {
	const { width, height } = useWindowDimensions();
	const tilt = useTilt();
	const lightX = useSharedValue(0);
	const lightY = useSharedValue(0);

	useAnimatedReaction(
		() => ({ x: tilt.x.value, y: tilt.y.value, frozen: frost.value > 0.001 }),
		(current) => {
			if (current.frozen) return;
			lightX.value = current.x;
			lightY.value = current.y;
		},
	);

	const picture = useDerivedValue(() =>
		createPicture((canvas) => {
			const lx = lightX.value;
			const ly = lightY.value;
			const full = Skia.XYWHRect(0, 0, width, height);

			// Faint gradients over dark ink only span a handful of 8-bit steps; dither them so
			// they read as a smooth falloff instead of visible bands
			const light = Skia.Paint();
			light.setDither(true);
			light.setShader(
				Skia.Shader.MakeRadialGradient(
					vec(width * (0.5 - lx * 0.6), height * (0.3 - ly * 0.6)),
					Math.max(width, height) * 0.95,
					LIGHT_ALPHAS.map((a) => Float32Array.of(1, 1, 1, a)),
					RAMP,
					TileMode.Clamp,
				),
			);
			canvas.drawRect(full, light);

			const wash = Skia.Paint();
			wash.setDither(true);
			const c = Skia.Color(accent.value);
			wash.setShader(
				Skia.Shader.MakeRadialGradient(
					vec(width / 2, height / 2),
					Math.hypot(width, height) * 0.55,
					WASH_ALPHAS.map((a) => Float32Array.of(c[0], c[1], c[2], a)),
					WASH_POSITIONS,
					TileMode.Clamp,
				),
			);
			canvas.drawRect(full, wash);
		}),
	);

	return (
		<Canvas style={[StyleSheet.absoluteFill, { backgroundColor: INK }]} pointerEvents="none">
			<Picture picture={picture} />
		</Canvas>
	);
};
