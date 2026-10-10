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
import type { SceneDot } from "../application/renderScene";
import type { ScreenSize } from "../domain/types";
import { useTilt } from "./tilt/TiltProvider";

interface GameCanvasProps {
	/** All dots to draw this frame (player last), written every frame by the frame clock */
	scene: SharedValue<SceneDot[]>;
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
		() => ({ x: tilt.x.value, y: tilt.y.value, frozen: frost.value > 0.001 }),
		(current, previous) => {
			if (current.frozen !== previous?.frozen) scheduleOnRN(setFrosted, current.frozen);
			if (current.frozen) return;
			lightX.value = current.x;
			lightY.value = current.y;
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
			const lx = lightX.value;
			const ly = lightY.value;

			const fill = Skia.Paint();
			fill.setAntiAlias(true);

			const ring = Skia.Paint();
			ring.setAntiAlias(true);
			ring.setStyle(PaintStyle.Stroke);
			ring.setColor(Skia.Color("rgba(255,255,255,0.85)"));

			// One unit-space glare shader per frame; its centre follows the light
			const gx = Math.max(
				-GLARE_MAX_OFFSET,
				Math.min(GLARE_MAX_OFFSET, GLARE_OFFSET - lx * GLARE_TILT_GAIN),
			);
			const gy = Math.max(
				-GLARE_MAX_OFFSET,
				Math.min(GLARE_MAX_OFFSET, GLARE_OFFSET - ly * GLARE_TILT_GAIN),
			);
			const glare = Skia.Paint();
			glare.setAntiAlias(true);
			glare.setShader(
				Skia.Shader.MakeRadialGradient(
					vec(gx, gy),
					GLARE_RADIUS,
					[Skia.Color("rgba(255,255,255,0.55)"), Skia.Color("rgba(255,255,255,0)")],
					null,
					TileMode.Clamp,
				),
			);

			// Unit-space halo shaders, one per colour seen this frame
			const halos: Record<string, ReturnType<typeof Skia.Paint>> = {};
			const haloFor = (color: string) => {
				let paint = halos[color];
				if (!paint) {
					paint = Skia.Paint();
					paint.setAntiAlias(true);
					const c = Skia.Color(color);
					const faded = Float32Array.from(c);
					faded[3] = 0;
					const mid = Float32Array.from(c);
					mid[3] = 0.16;
					const core = Float32Array.from(c);
					core[3] = 0.5;
					paint.setShader(
						Skia.Shader.MakeRadialGradient(
							vec(0, 0),
							1,
							[core, mid, faded],
							[0.3, 0.6, 1],
							TileMode.Clamp,
						),
					);
					halos[color] = paint;
				}
				return paint;
			};

			const dots = scene.value;
			// Halos first so no glow sits on top of a neighbouring body
			for (const dot of dots) {
				if (dot.radius <= 0 || dot.kind === "player") continue;
				const scale = dot.radius * HALO_SCALE;
				canvas.save();
				canvas.translate(dot.x, dot.y);
				canvas.scale(scale, scale);
				canvas.drawCircle(0, 0, 1, haloFor(dot.color));
				canvas.restore();
			}
			for (const dot of dots) {
				if (dot.radius <= 0) continue;
				fill.setColor(Skia.Color(dot.color));
				canvas.drawCircle(dot.x, dot.y, dot.radius, fill);
				canvas.save();
				canvas.translate(dot.x, dot.y);
				canvas.scale(dot.radius, dot.radius);
				canvas.drawCircle(0, 0, 1, glare);
				if (dot.kind === "player") {
					ring.setStrokeWidth(0.09);
					canvas.drawCircle(0, 0, 0.62, ring);
				}
				canvas.restore();
			}
		}),
	);

	const frostSigma = useDerivedValue(() => frost.value * FROST_MAX_SIGMA);

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
