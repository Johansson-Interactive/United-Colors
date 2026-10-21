import {
	Canvas,
	createPicture,
	Picture,
	type SkCanvas,
	Skia,
	type SkPaint,
	type SkShader,
	TileMode,
	vec,
} from "@shopify/react-native-skia";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
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
import {
	type ColorBy,
	dotReveal,
	GLOW_CORE_ALPHA,
	GLOW_SCALE,
	layoutDotMatrix,
	matrixBox,
	PARALLAX_GAIN,
	paletteIndex,
	revealOrder,
} from "../dotmatrix/layout";
import { recordPicture } from "../recordPicture";
import { WHITE } from "../theme/theme";
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
	/** Spread the palette per dot (default) or give each letter one colour */
	colorBy?: ColorBy;
	/** Soft glow behind each dot */
	glow?: boolean;
	/**
	 * Colour layers drift apart with device tilt, giving the text depth. With one colour per
	 * letter the word drifts as one, so letters never slide into each other.
	 */
	parallax?: boolean;
	/** Dots swell in a slow travelling wave */
	wave?: boolean;
	/** How far the text has popped in, 0..1 (see dotReveal): its dots appear left to right */
	reveal?: SharedValue<number>;
	opacity?: number;
	style?: StyleProp<ViewStyle>;
}

const WAVE_PERIOD_MS = 3600;
const WAVE_AMPLITUDE = 0.22;
const LAYER_DEPTH = [1, 0.55, 0.2] as const;
const WORD_DEPTH = 0.6;

/** The dot body colour: the colour string at the text's opacity */
function fillColor(color: string, opacity: number): Float32Array {
	"worklet";
	const col = Float32Array.from(Skia.Color(color));
	col[3] *= opacity;
	return col;
}

/** The glow: a unit-radius falloff from a translucent core to clear, in the dot's colour */
function glowShader(color: string, opacity: number): SkShader {
	"worklet";
	const col = Skia.Color(color);
	const core = Float32Array.from(col);
	core[3] = GLOW_CORE_ALPHA * opacity;
	const clear = Float32Array.from(col);
	clear[3] = 0;
	return Skia.Shader.MakeRadialGradient(vec(0, 0), 1, [core, clear], null, TileMode.Clamp);
}

function makePaint(): SkPaint {
	const paint = Skia.Paint();
	paint.setAntiAlias(true);
	return paint;
}

/**
 * Text set in the game's own alphabet: a 5x7 grid of dots per character, drawn in Skia.
 * Used for titles, scores and button labels so the whole interface speaks "dot".
 *
 * Paints are built once on the JS thread and captured by the picture worklet. A palette or
 * a plain colour string is baked into them up front; an animated colour is parsed on the UI
 * thread only when its string changes, and the frame just applies it to the one paint.
 */
export const DotMatrixText: React.FC<DotMatrixTextProps> = ({
	text,
	pitch,
	dotScale = 0.38,
	color = WHITE,
	colors,
	colorBy = "dot",
	glow = false,
	parallax = false,
	wave = false,
	reveal,
	opacity = 1,
	style,
}) => {
	const tilt = useTilt();
	const layout = useMemo(() => layoutDotMatrix(text), [text]);
	// Plain data for the UI-thread worklet: position in cells plus a palette index per dot
	const dots = useMemo(() => {
		const ranks = revealOrder(layout);
		return layout.dots.map((d) => ({
			col: d.col,
			row: d.row,
			ci: colors ? paletteIndex(d, colors.length, colorBy) : 0,
			rank: ranks[d.index],
		}));
	}, [layout, colors, colorBy]);
	const { width, height, pad } = useMemo(
		() => matrixBox(layout, pitch, glow, parallax),
		[layout, pitch, glow, parallax],
	);

	// A palette, or a single colour string, is known up front; only a shared value is not
	const staticPalette = useMemo(
		() => colors ?? (typeof color === "string" ? [color] : null),
		[colors, color],
	);
	const paints = useMemo(() => {
		const fills = (staticPalette ?? [""]).map(() => makePaint());
		const glows = glow ? fills.map(() => makePaint()) : null;
		staticPalette?.forEach((c, i) => {
			fills[i].setColor(fillColor(c, opacity));
			glows?.[i].setShader(glowShader(c, opacity));
		});
		return { fills, glows };
	}, [staticPalette, glow, opacity]);

	const zero = useSharedValue(0);
	const phase = useSharedValue(0);
	useEffect(() => {
		if (!wave) return;
		phase.set(0);
		phase.set(
			withRepeat(withTiming(Math.PI * 2, { duration: WAVE_PERIOD_MS, easing: Easing.linear }), -1),
		);
		return () => cancelAnimation(phase);
	}, [wave, phase]);

	const tiltX = parallax ? tilt.x : zero;
	const tiltY = parallax ? tilt.y : zero;

	// For an animated colour, parse it once per change rather than once per frame
	const animatedColor = staticPalette !== null || typeof color === "string" ? null : color;
	const liveFill = useDerivedValue(() =>
		animatedColor ? fillColor(animatedColor.get(), opacity) : null,
	);
	const liveGlow = useDerivedValue(() =>
		animatedColor && glow ? glowShader(animatedColor.get(), opacity) : null,
	);

	// A picture that changes every frame (a wave, parallax with the tilt, or a reveal) is recorded
	// into one recorder kept for the text's life (see recordPicture.ts); any other is recorded
	// afresh only when it changes
	const [recorder] = useState(() => (wave || parallax || reveal ? Skia.PictureRecorder() : null));
	const picture = useDerivedValue(() => {
		const draw = (canvas: SkCanvas) => {
			const { fills, glows } = paints;
			const fill = liveFill.get();
			if (fill) fills[0].setColor(fill);
			const glowFill = liveGlow.get();
			if (glowFill) glows?.[0].setShader(glowFill);

			const r = pitch * dotScale;
			const revealed = reveal ? reveal.get() : 1;
			const count = dots.length;
			const ph = phase.get();
			const tx = tiltX.get() * PARALLAX_GAIN;
			const ty = tiltY.get() * PARALLAX_GAIN;

			for (let pass = glows ? 0 : 1; pass < 2; pass++) {
				for (const dot of dots) {
					const ci = dot.ci;
					const depth = !parallax
						? 0
						: colorBy === "letter"
							? WORD_DEPTH
							: LAYER_DEPTH[ci % LAYER_DEPTH.length];
					const cx = pad + (dot.col + 0.5) * pitch + tx * depth;
					const cy = pad + (dot.row + 0.5) * pitch + ty * depth;
					const swell = wave
						? 1 + WAVE_AMPLITUDE * Math.sin(ph + dot.col * 0.45 - dot.row * 0.25)
						: 1;
					const pop = revealed >= 1 ? 1 : dotReveal(dot.rank, count, revealed);
					if (pop <= 0) continue;
					const radius = r * swell * pop;
					if (pass === 0 && glows) {
						canvas.save();
						canvas.translate(cx, cy);
						canvas.scale(radius * GLOW_SCALE, radius * GLOW_SCALE);
						canvas.drawCircle(0, 0, 1, glows[ci]);
						canvas.restore();
					} else {
						canvas.drawCircle(cx, cy, radius, fills[ci]);
					}
				}
			}
		};
		return recorder ? recordPicture(recorder, draw) : createPicture(draw);
	});

	return (
		<Canvas style={[{ width, height }, style]} pointerEvents="none">
			<Picture picture={picture} />
		</Canvas>
	);
};
