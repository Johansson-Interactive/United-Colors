import {
	Blur,
	Canvas,
	createPicture,
	Group,
	Paint,
	PaintStyle,
	Picture,
	Skia,
	TileMode,
	vec,
} from "@shopify/react-native-skia";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { type LayoutChangeEvent, PanResponder, StyleSheet, View } from "react-native";
import {
	type SharedValue,
	useAnimatedReaction,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
	SCENE_COLOR,
	SCENE_KIND,
	SCENE_KIND_PLAYER,
	SCENE_RADIUS,
	SCENE_STRIDE,
	SCENE_X,
	SCENE_Y,
} from "../application/renderScene";
import { GAME_COLORS } from "../domain/constants";
import type { ScreenSize } from "../domain/types";
import { useTilt } from "./tilt/TiltProvider";

interface GameCanvasProps {
	/** All dots to draw this frame (player last) as flat records, written every frame by the frame clock */
	scene: SharedValue<Float32Array>;
	onLayout: (size: ScreenSize) => void;
	/** 0 = live; 1 = fully frosted (blurred) for pause / game over */
	frost: SharedValue<number>;
	/** When set (e.g. __DEV__), drag gestures report (dx, dy) for player control */
	onDragDelta?: (dx: number, dy: number) => void;
}

/** Glare centre offset and radius relative to a unit-radius dot, when the device is level */
const GLARE_OFFSET = -0.28;
const GLARE_RADIUS = 0.75;
/** How far (unit radii per radian of tilt) the light slides across each dot */
const GLARE_TILT_GAIN = 0.45;
const GLARE_MAX_OFFSET = 0.55;
/** Halo (soft glow behind each non-player dot) size relative to its radius */
const HALO_SCALE = 1.9;
const FROST_MAX_SIGMA = 14;

// Paints and colours are built once on the JS thread and captured by the picture worklet,
// so a frame only sets the fill colour and draws.

/** Body colours, indexed by the scene's colour index (GAME_COLORS order) */
const FILL_COLORS = GAME_COLORS.map((color) => Skia.Color(color));

const FILL_PAINT = Skia.Paint();
FILL_PAINT.setAntiAlias(true);

/** White core ring on the player, in unit-radius space */
const RING_PAINT = Skia.Paint();
RING_PAINT.setAntiAlias(true);
RING_PAINT.setStyle(PaintStyle.Stroke);
RING_PAINT.setStrokeWidth(0.09);
RING_PAINT.setColor(Skia.Color("rgba(255,255,255,0.85)"));

/**
 * Specular glare centred on the origin in unit-radius space. Instead of moving the shader
 * with the light, the canvas is shifted so the origin sits at the glare centre and the dot
 * is drawn offset by the opposite amount.
 */
const GLARE_PAINT = Skia.Paint();
GLARE_PAINT.setAntiAlias(true);
GLARE_PAINT.setShader(
	Skia.Shader.MakeRadialGradient(
		vec(0, 0),
		GLARE_RADIUS,
		[Skia.Color("rgba(255,255,255,0.55)"), Skia.Color("rgba(255,255,255,0)")],
		null,
		TileMode.Clamp,
	),
);

/** Unit-space soft glow per game colour, indexed like FILL_COLORS */
const HALO_PAINTS = FILL_COLORS.map((color) => {
	const paint = Skia.Paint();
	paint.setAntiAlias(true);
	const withAlpha = (alpha: number) => {
		const c = Float32Array.from(color);
		c[3] = alpha;
		return c;
	};
	paint.setShader(
		Skia.Shader.MakeRadialGradient(
			vec(0, 0),
			1,
			[withAlpha(0.5), withAlpha(0.16), withAlpha(0)],
			[0.3, 0.6, 1],
			TileMode.Clamp,
		),
	);
	return paint;
});

/**
 * Skia game canvas. The whole scene is recorded into one Picture on the UI thread every
 * frame from the `scene` shared value, with no React reconciliation per frame.
 *
 * Every dot is drawn as a lit glass bead: a soft halo in its own colour, a solid body and a
 * specular glare whose position follows the device tilt, so the dots read as physical
 * objects under a fixed light. The player dot has no halo, so its edge stays sharp and the
 * gap to other dots is easy to judge; it gets a white core ring instead.
 * The canvas is transparent over the ambient background. Lighting freezes while frosted,
 * and the blur layer only exists while frosted, so a live scene pays nothing for it.
 */
export const GameCanvas: React.FC<GameCanvasProps> = ({ scene, onLayout, frost, onDragDelta }) => {
	const tilt = useTilt();
	const lightX = useSharedValue(0);
	const lightY = useSharedValue(0);
	const [frosted, setFrosted] = useState(false);

	// Only track the light while live: frosted scenes stay still even as the phone moves
	useAnimatedReaction(
		() => ({ x: tilt.x.get(), y: tilt.y.get(), frozen: frost.get() > 0.001 }),
		(current, previous) => {
			if (current.frozen !== previous?.frozen) scheduleOnRN(setFrosted, current.frozen);
			if (current.frozen) return;
			lightX.set(current.x);
			lightY.set(current.y);
		},
	);

	const handleLayout = useCallback(
		(event: LayoutChangeEvent) => {
			const { width, height } = event.nativeEvent.layout;
			onLayout({ width, height });
		},
		[onLayout],
	);

	// Use touch position (not cumulative dx/dy) so deltas are correct and no jump-back on gesture resets
	const panResponder = useMemo(() => {
		if (!onDragDelta) return null;
		let lastTouch: { x: number; y: number } | null = null;
		return PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: (evt) => {
				const { pageX, pageY } = evt.nativeEvent;
				lastTouch = { x: pageX, y: pageY };
			},
			onPanResponderMove: (evt) => {
				const { pageX, pageY } = evt.nativeEvent;
				const prev = lastTouch;
				if (prev === null) return;
				onDragDelta(pageX - prev.x, pageY - prev.y);
				lastTouch = { x: pageX, y: pageY };
			},
			onPanResponderRelease: () => {
				lastTouch = null;
			},
		});
	}, [onDragDelta]);

	const picture = useDerivedValue(() =>
		createPicture((canvas) => {
			// The glare slides across each dot with the light; see GLARE_PAINT for the transform
			const gx = Math.max(
				-GLARE_MAX_OFFSET,
				Math.min(GLARE_MAX_OFFSET, GLARE_OFFSET - lightX.get() * GLARE_TILT_GAIN),
			);
			const gy = Math.max(
				-GLARE_MAX_OFFSET,
				Math.min(GLARE_MAX_OFFSET, GLARE_OFFSET - lightY.get() * GLARE_TILT_GAIN),
			);

			const dots = scene.get();
			const end = dots.length;
			// Halos first so no glow sits on top of a neighbouring body
			for (let i = 0; i < end; i += SCENE_STRIDE) {
				const radius = dots[i + SCENE_RADIUS];
				if (radius <= 0 || dots[i + SCENE_KIND] === SCENE_KIND_PLAYER) continue;
				const scale = radius * HALO_SCALE;
				canvas.save();
				canvas.translate(dots[i + SCENE_X], dots[i + SCENE_Y]);
				canvas.scale(scale, scale);
				canvas.drawCircle(0, 0, 1, HALO_PAINTS[dots[i + SCENE_COLOR]]);
				canvas.restore();
			}
			for (let i = 0; i < end; i += SCENE_STRIDE) {
				const radius = dots[i + SCENE_RADIUS];
				if (radius <= 0) continue;
				const x = dots[i + SCENE_X];
				const y = dots[i + SCENE_Y];
				FILL_PAINT.setColor(FILL_COLORS[dots[i + SCENE_COLOR]]);
				canvas.drawCircle(x, y, radius, FILL_PAINT);
				canvas.save();
				canvas.translate(x + gx * radius, y + gy * radius);
				canvas.scale(radius, radius);
				canvas.drawCircle(-gx, -gy, 1, GLARE_PAINT);
				if (dots[i + SCENE_KIND] === SCENE_KIND_PLAYER) {
					canvas.drawCircle(-gx, -gy, 0.62, RING_PAINT);
				}
				canvas.restore();
			}
		}),
	);

	const frostSigma = useDerivedValue(() => frost.get() * FROST_MAX_SIGMA);

	// When using drag, Canvas must not capture touches so the container gets them
	const canvasPointerEvents = onDragDelta ? "none" : "auto";

	return (
		<View style={styles.container} onLayout={handleLayout} {...(panResponder?.panHandlers ?? {})}>
			<Canvas style={StyleSheet.absoluteFill} pointerEvents={canvasPointerEvents}>
				{frosted ? (
					<Group
						layer={
							<Paint>
								<Blur blur={frostSigma} />
							</Paint>
						}
					>
						<Picture picture={picture} />
					</Group>
				) : (
					<Picture picture={picture} />
				)}
			</Canvas>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "transparent",
	},
});
