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

			const light = Skia.Paint();
			light.setShader(
				Skia.Shader.MakeRadialGradient(
					vec(width * (0.5 - lx * 0.6), height * (0.3 - ly * 0.6)),
					Math.max(width, height) * 0.95,
					[Skia.Color("rgba(255,255,255,0.075)"), Skia.Color("rgba(255,255,255,0)")],
					null,
					TileMode.Clamp,
				),
			);
			canvas.drawRect(full, light);

			const wash = Skia.Paint();
			const c = Skia.Color(accent.value);
			const clear = Float32Array.from(c);
			clear[3] = 0;
			const edge = Float32Array.from(c);
			edge[3] = 0.26;
			wash.setShader(
				Skia.Shader.MakeRadialGradient(
					vec(width / 2, height / 2),
					Math.hypot(width, height) * 0.55,
					[clear, clear, edge],
					[0, 0.55, 1],
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
