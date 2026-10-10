import { Canvas, createPicture, Picture, Skia, TileMode, vec } from "@shopify/react-native-skia";
import type React from "react";
import { useEffect, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import {
	cancelAnimation,
	Easing,
	type SharedValue,
	useDerivedValue,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { layoutDotMatrix, matrixSize, trioIndex } from "../dotmatrix/layout";
import { useTilt } from "../tilt/TiltProvider";

interface DotMatrixTextProps {
	text: string;
	/** Centre-to-centre spacing of the dots, in px */
	pitch: number;
	/** Dot radius as a fraction of the pitch */
	dotScale?: number;
	/** Single colour (may be animated), or a palette assigned per dot */
	color?: string | SharedValue<string>;
	colors?: readonly string[];
	/** Soft glow behind each dot */
	glow?: boolean;
	/** Colour layers drift apart with device tilt, giving the text depth */
	parallax?: boolean;
	/** Dots swell in a slow travelling wave */
	wave?: boolean;
	opacity?: number;
	style?: StyleProp<ViewStyle>;
}

const WAVE_PERIOD_MS = 3600;
const WAVE_AMPLITUDE = 0.22;
/** Pixels of drift per radian of tilt for the deepest layer */
const PARALLAX_GAIN = 26;
const LAYER_DEPTH = [1, 0.55, 0.2] as const;
const GLOW_SCALE = 2.6;

/**
 * Text set in the game's own alphabet: a 5x7 grid of dots per character, drawn in Skia.
 * Used for titles, scores and button labels so the whole interface speaks "dot".
 */
export const DotMatrixText: React.FC<DotMatrixTextProps> = ({
	text,
	pitch,
	dotScale = 0.38,
	color = "#F4F6FB",
	colors,
	glow = false,
	parallax = false,
	wave = false,
	opacity = 1,
	style,
}) => {
	const tilt = useTilt();
	const layout = useMemo(() => layoutDotMatrix(text), [text]);
	// Plain data for the UI-thread worklet: position in cells plus a palette index per dot
	const dots = useMemo(
		() =>
			layout.dots.map((d) => ({
				col: d.col,
				row: d.row,
				ci: colors ? trioIndex(d) % colors.length : 0,
			})),
		[layout, colors],
	);
	const base = useMemo(() => matrixSize(layout, pitch), [layout, pitch]);
	// Room for parallax drift and glow so nothing clips at the canvas edge
	const pad = Math.ceil((parallax ? PARALLAX_GAIN * 0.8 : 0) + pitch * (glow ? 1.2 : 0.5));
	const width = base.width + pad * 2;
	const height = base.height + pad * 2;

	const zero = useSharedValue(0);
	const phase = useSharedValue(0);
	useEffect(() => {
		if (!wave) return;
		phase.value = 0;
		phase.value = withRepeat(
			withTiming(Math.PI * 2, { duration: WAVE_PERIOD_MS, easing: Easing.linear }),
			-1,
		);
		return () => cancelAnimation(phase);
	}, [wave, phase]);

	const tiltX = parallax ? tilt.x : zero;
	const tiltY = parallax ? tilt.y : zero;
	const colorValue = useDerivedValue(() => (typeof color === "string" ? color : color.value));

	const picture = useDerivedValue(() =>
		createPicture((canvas) => {
			const palette = colors ?? [colorValue.value];
			const paints = palette.map((c) => {
				const p = Skia.Paint();
				p.setAntiAlias(true);
				const col = Float32Array.from(Skia.Color(c));
				col[3] *= opacity;
				p.setColor(col);
				return p;
			});
			const glows = glow
				? palette.map((c) => {
						const p = Skia.Paint();
						p.setAntiAlias(true);
						const col = Skia.Color(c);
						const core = Float32Array.from(col);
						core[3] = 0.35 * opacity;
						const clear = Float32Array.from(col);
						clear[3] = 0;
						p.setShader(
							Skia.Shader.MakeRadialGradient(vec(0, 0), 1, [core, clear], null, TileMode.Clamp),
						);
						return p;
					})
				: null;

			const r = pitch * dotScale;
			const ph = phase.value;
			const tx = tiltX.value * PARALLAX_GAIN;
			const ty = tiltY.value * PARALLAX_GAIN;

			for (let pass = glows ? 0 : 1; pass < 2; pass++) {
				for (const dot of dots) {
					const ci = dot.ci;
					const depth = parallax ? LAYER_DEPTH[ci % LAYER_DEPTH.length] : 0;
					const cx = pad + (dot.col + 0.5) * pitch + tx * depth;
					const cy = pad + (dot.row + 0.5) * pitch + ty * depth;
					const swell = wave
						? 1 + WAVE_AMPLITUDE * Math.sin(ph + dot.col * 0.45 - dot.row * 0.25)
						: 1;
					const radius = r * swell;
					if (pass === 0 && glows) {
						canvas.save();
						canvas.translate(cx, cy);
						canvas.scale(radius * GLOW_SCALE, radius * GLOW_SCALE);
						canvas.drawCircle(0, 0, 1, glows[ci]);
						canvas.restore();
					} else {
						canvas.drawCircle(cx, cy, radius, paints[ci]);
					}
				}
			}
		}),
	);

	return (
		<Canvas style={[{ width, height }, style]} pointerEvents="none">
			<Picture picture={picture} />
		</Canvas>
	);
};

/** Pixel width of a line of dot-matrix text at a pitch (no padding) */
export function dotMatrixWidth(text: string, pitch: number): number {
	return matrixSize(layoutDotMatrix(text), pitch).width;
}
