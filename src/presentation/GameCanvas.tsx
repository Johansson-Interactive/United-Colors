import { Blur, Canvas, createPicture, Group, Paint, Picture } from "@shopify/react-native-skia";
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
import type { ScreenSize } from "../domain/types";
import { drawScene } from "./sceneDrawer";
import { useTilt } from "./tilt/TiltProvider";

interface GameCanvasProps {
	/** All dots to draw this frame (player last) as flat records, written every frame by the session */
	scene: SharedValue<Float32Array>;
	onLayout: (size: ScreenSize) => void;
	/** 0 = live; 1 = fully frosted (blurred) for pause / game over */
	frost: SharedValue<number>;
	/** When set (e.g. __DEV__), drag gestures report (dx, dy) for player control */
	onDragDelta?: (dx: number, dy: number) => void;
}

const FROST_MAX_SIGMA = 14;

/**
 * Skia game canvas. The whole scene is recorded into one Picture on the UI thread every
 * frame from the `scene` shared value, with no React reconciliation per frame; how the dots
 * are drawn is in sceneDrawer.ts. The light the dots are lit from follows the device tilt.
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
		createPicture((canvas) => drawScene(canvas, scene.get(), lightX.get(), lightY.get())),
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
