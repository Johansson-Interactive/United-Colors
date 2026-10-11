import { Canvas, createPicture, Picture, Skia, TileMode, vec } from "@shopify/react-native-skia";
import type React from "react";
import { useMemo } from "react";
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
const LIGHT_COLORS = RAMP.map((t) => Float32Array.of(1, 1, 1, LIGHT_PEAK * (1 - smoothstep(t))));

/** Edge wash: clear across the middle, easing in toward the corners */
const WASH_START = 0.55;
const WASH_PEAK = 0.26;
const WASH_POSITIONS = [0, ...RAMP.map((t) => WASH_START + t * (1 - WASH_START))];
const WASH_ALPHAS = [0, ...RAMP.map((t) => WASH_PEAK * smoothstep(t))];

/**
 * The light pool, centred on the origin and sized for the window. Built once per window
 * size on the JS thread; each frame only translates the canvas to where the light sits.
 */
function makeLightPaint(width: number, height: number) {
	const paint = Skia.Paint();
	// Faint gradients over dark ink only span a handful of 8-bit steps; dither them so
	// they read as a smooth falloff instead of visible bands
	paint.setDither(true);
	paint.setShader(
		Skia.Shader.MakeRadialGradient(
			vec(0, 0),
			Math.max(width, height) * 0.95,
			LIGHT_COLORS,
			RAMP,
			TileMode.Clamp,
		),
	);
	return paint;
}

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
 *
 * The light and the wash are separate pictures: the light is re-recorded only while the
 * tilt moves, the wash only when the accent changes, so a still phone records nothing.
 */
export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ accent, frost }) => {
	const { width, height } = useWindowDimensions();
	const tilt = useTilt();
	const lightX = useSharedValue(0);
	const lightY = useSharedValue(0);
	const lightPaint = useMemo(() => makeLightPaint(width, height), [width, height]);

	useAnimatedReaction(
		() => ({ x: tilt.x.get(), y: tilt.y.get(), frozen: frost.get() > 0.001 }),
		(current) => {
			if (current.frozen) return;
			lightX.set(current.x);
			lightY.set(current.y);
		},
	);

	const lightPicture = useDerivedValue(() =>
		createPicture(
			(canvas) => {
				canvas.save();
				canvas.translate(width * (0.5 - lightX.get() * 0.6), height * (0.3 - lightY.get() * 0.6));
				canvas.drawPaint(lightPaint);
				canvas.restore();
			},
			{ width, height },
		),
	);

	const washPicture = useDerivedValue(() =>
		createPicture(
			(canvas) => {
				const wash = Skia.Paint();
				wash.setDither(true);
				const c = Skia.Color(accent.get());
				// A plain loop, not .map(callback): the React Compiler hoists callbacks out of the
				// worklet into plain JS functions, which the UI thread cannot call
				const washColors: Float32Array[] = [];
				for (const a of WASH_ALPHAS) washColors.push(Float32Array.of(c[0], c[1], c[2], a));
				wash.setShader(
					Skia.Shader.MakeRadialGradient(
						vec(width / 2, height / 2),
						Math.hypot(width, height) * 0.55,
						washColors,
						WASH_POSITIONS,
						TileMode.Clamp,
					),
				);
				canvas.drawPaint(wash);
			},
			{ width, height },
		),
	);

	return (
		<Canvas style={[StyleSheet.absoluteFill, { backgroundColor: INK }]} pointerEvents="none">
			<Picture picture={lightPicture} />
			<Picture picture={washPicture} />
		</Canvas>
	);
};
