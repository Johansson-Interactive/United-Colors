import { Canvas, createPicture, Picture, Skia, TileMode, vec } from "@shopify/react-native-skia";
import type React from "react";
import { useCallback, useMemo, useRef } from "react";
import { type LayoutChangeEvent, PanResponder, StyleSheet, View } from "react-native";
import { type SharedValue, useDerivedValue } from "react-native-reanimated";
import type { SceneDot } from "../application/renderScene";
import type { ScreenSize } from "../domain/types";

interface GameCanvasProps {
	/** All dots to draw this frame (player last), written every frame by the frame clock */
	scene: SharedValue<SceneDot[]>;
	onLayout: (size: ScreenSize) => void;
	/** When set (e.g. __DEV__), drag gestures report (dx, dy) for player control */
	onDragDelta?: (dx: number, dy: number) => void;
}

const DOT_GLARE_INNER_OPACITY = 0.6;
/** Glare circle radius and gradient center, relative to a unit-radius dot */
const GLARE_RADIUS = 0.7;
const GLARE_OFFSET = -0.25;

/**
 * Skia-based game canvas. The whole scene is recorded into one Picture on the UI thread
 * every frame from the `scene` shared value -- no React reconciliation per frame.
 * Each dot is a filled circle with a radial-gradient glare overlay.
 */
export const GameCanvas: React.FC<GameCanvasProps> = ({ scene, onLayout, onDragDelta }) => {
	const handleLayout = useCallback(
		(event: LayoutChangeEvent) => {
			const { width, height } = event.nativeEvent.layout;
			onLayout({ width, height });
		},
		[onLayout],
	);

	// Use touch position (not cumulative dx/dy) so deltas are correct and no jump-back on gesture resets
	const lastTouch = useRef<{ x: number; y: number } | null>(null);
	const panResponder = useMemo(
		() =>
			onDragDelta
				? PanResponder.create({
						onStartShouldSetPanResponder: () => true,
						onMoveShouldSetPanResponder: () => true,
						onPanResponderGrant: (evt) => {
							const { pageX, pageY } = evt.nativeEvent;
							lastTouch.current = { x: pageX, y: pageY };
						},
						onPanResponderMove: (evt) => {
							const { pageX, pageY } = evt.nativeEvent;
							const prev = lastTouch.current;
							if (prev === null) return;
							onDragDelta(pageX - prev.x, pageY - prev.y);
							lastTouch.current = { x: pageX, y: pageY };
						},
						onPanResponderRelease: () => {
							lastTouch.current = null;
						},
					})
				: null,
		[onDragDelta],
	);

	const picture = useDerivedValue(() =>
		createPicture((canvas) => {
			const fill = Skia.Paint();
			fill.setAntiAlias(true);
			// One unit-space glare shader, scaled per dot via the canvas transform
			const glare = Skia.Paint();
			glare.setAntiAlias(true);
			glare.setAlphaf(DOT_GLARE_INNER_OPACITY);
			glare.setShader(
				Skia.Shader.MakeRadialGradient(
					vec(GLARE_OFFSET, GLARE_OFFSET),
					GLARE_RADIUS,
					[Skia.Color("rgba(255,255,255,0.5)"), Skia.Color("rgba(255,255,255,0)")],
					null,
					TileMode.Clamp,
				),
			);
			for (const dot of scene.value) {
				if (dot.radius <= 0) continue;
				fill.setColor(Skia.Color(dot.color));
				canvas.drawCircle(dot.x, dot.y, dot.radius, fill);
				canvas.save();
				canvas.translate(dot.x, dot.y);
				canvas.scale(dot.radius, dot.radius);
				canvas.drawCircle(0, 0, GLARE_RADIUS, glare);
				canvas.restore();
			}
		}),
	);

	// When using drag, Canvas must not capture touches so the container gets them
	const canvasPointerEvents = onDragDelta ? "none" : "auto";

	return (
		<View style={styles.container} onLayout={handleLayout} {...(panResponder?.panHandlers ?? {})}>
			<Canvas style={StyleSheet.absoluteFill} pointerEvents={canvasPointerEvents}>
				<Picture picture={picture} />
			</Canvas>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#78B7E3",
	},
});
