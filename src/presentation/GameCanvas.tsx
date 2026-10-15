import {
	Blur,
	Canvas,
	Fill,
	Group,
	Paint,
	Picture,
	RadialGradient,
	Rect,
	Shader,
	Skia,
	type SkPoint,
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
import type { ScreenSize } from "../domain/types";
import { useStageBox } from "./layout/StageFrame";
import { recordPicture } from "./recordPicture";
import {
	LIGHT_ALPHAS,
	LIGHT_RADIUS,
	lightCentre,
	RAMP,
	stageCover,
	WASH_ALPHAS,
	WASH_POSITIONS,
	WASH_RADIUS,
} from "./room";
import { drawScene, liquidBody, MERGE_EFFECT } from "./sceneDrawer";
import { INK } from "./theme/theme";
import { useTilt } from "./tilt/TiltProvider";

interface GameCanvasProps {
	/** All dots to draw this frame (player last) as flat records, written every frame by the session */
	scene: SharedValue<Float32Array>;
	onLayout: (size: ScreenSize) => void;
	/** 0 = live; 1 = fully frosted (blurred) for pause / game over */
	frost: SharedValue<number>;
	/** Colour washed into the room's edges (the player's colour while playing) */
	accent: SharedValue<string>;
	/** How much of the stage (the scene) shows over the room, 0..1 */
	stageOpacity: SharedValue<number>;
	/** Sideways shake of the scene (px), for the final hit */
	shake: SharedValue<number>;
	/** When set (e.g. __DEV__), drag gestures report (dx, dy) for player control */
	onDragDelta?: (dx: number, dy: number) => void;
}

const FROST_MAX_SIGMA = 14;

/** The light pool's colour stops: white, easing out to nothing (see room.ts) */
const LIGHT_COLORS = LIGHT_ALPHAS.map((a) => Float32Array.of(1, 1, 1, a));

interface RoomProps {
	width: number;
	height: number;
	/** Where the light pool is centred, following the tilt */
	light: SharedValue<SkPoint>;
	/** The edge wash's colour stops, in the accent colour */
	wash: SharedValue<Float32Array[]>;
}

/**
 * The room (see room.ts): ink, the light pool and the edge wash. Drawn as Skia nodes driven by
 * shared values rather than recorded into a picture every frame: a full-screen gradient
 * picture reports hundreds of KB to Hermes as external memory each time it is recorded, which
 * set off a garbage collection on the UI thread nearly every frame.
 */
const Room: React.FC<RoomProps> = ({ width, height, light, wash }) => (
	<>
		<Fill color={INK} />
		{/* Faint gradients over dark ink only span a handful of 8-bit steps; dither them so they
		    read as a smooth falloff instead of visible bands */}
		<Fill dither>
			<RadialGradient
				c={light}
				r={Math.max(width, height) * LIGHT_RADIUS}
				colors={LIGHT_COLORS}
				positions={RAMP}
			/>
		</Fill>
		<Fill dither>
			<RadialGradient
				c={vec(width / 2, height / 2)}
				r={Math.hypot(width, height) * WASH_RADIUS}
				colors={wash}
				positions={WASH_POSITIONS}
			/>
		</Fill>
	</>
);

/**
 * The game canvas: the room (see room.ts), then the whole scene, recorded into one Picture on
 * the UI thread every frame from the `scene` shared value, with no React reconciliation per
 * frame; how the dots are drawn is in sceneDrawer.ts. The light the room and the dots are lit
 * from follows the device tilt, and freezes while frosted.
 *
 * The canvas is opaque and draws everything behind the interface itself: on Android that
 * makes it a SurfaceView, which the system composites directly, instead of a transparent
 * TextureView the app's own render thread has to blend into the window every frame. A
 * SurfaceView ignores the opacity and transforms of the views around it, so the stage fade
 * and the shake are drawn here too. The blur layer only exists while frosted and the fade
 * cover only while fading, so a live scene pays for neither.
 */
export const GameCanvas: React.FC<GameCanvasProps> = ({
	scene,
	onLayout,
	frost,
	accent,
	stageOpacity,
	shake,
	onDragDelta,
}) => {
	const { width, height } = useStageBox();
	const tilt = useTilt();
	const lightX = useSharedValue(0);
	const lightY = useSharedValue(0);
	const [frosted, setFrosted] = useState(false);
	const [fading, setFading] = useState(false);

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

	useAnimatedReaction(
		() => stageCover(stageOpacity.get()) > 0,
		(current, previous) => {
			if (current !== previous) scheduleOnRN(setFading, current);
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

	const light = useDerivedValue(() => {
		const centre = lightCentre(width, height, lightX.get(), lightY.get());
		return vec(centre.x, centre.y);
	});

	// The wash only changes with the accent, so its stops are rebuilt then and not per frame
	const wash = useDerivedValue(() => {
		const c = Skia.Color(accent.get());
		// A plain loop, not .map(callback): the React Compiler hoists callbacks out of the
		// worklet into plain JS functions, which the UI thread cannot call
		const colors: Float32Array[] = [];
		for (const a of WASH_ALPHAS) colors.push(Float32Array.of(c[0], c[1], c[2], a));
		return colors;
	});

	// The scene in two layers with the liquid body between them (see sceneDrawer.ts), each
	// recorded every frame and so into the same recorder each time (see recordPicture.ts)
	const [belowRecorder] = useState(() => Skia.PictureRecorder());
	const [aboveRecorder] = useState(() => Skia.PictureRecorder());
	const below = useDerivedValue(() =>
		recordPicture(belowRecorder, (canvas) =>
			drawScene(canvas, scene.get(), lightX.get(), lightY.get(), "below"),
		),
	);
	const above = useDerivedValue(() =>
		recordPicture(aboveRecorder, (canvas) =>
			drawScene(canvas, scene.get(), lightX.get(), lightY.get(), "above"),
		),
	);
	const body = useDerivedValue(() => liquidBody(scene.get()));
	const bodyX = useDerivedValue(() => body.get().x);
	const bodyY = useDerivedValue(() => body.get().y);
	const bodyWidth = useDerivedValue(() => body.get().width);
	const bodyHeight = useDerivedValue(() => body.get().height);
	const bodyUniforms = useDerivedValue(() => body.get().uniforms);

	const frostSigma = useDerivedValue(() => frost.get() * FROST_MAX_SIGMA);
	const shakeTransform = useDerivedValue(() => [{ translateX: shake.get() }]);
	const cover = useDerivedValue(() => stageCover(stageOpacity.get()));

	// When using drag, Canvas must not capture touches so the container gets them
	const canvasPointerEvents = onDragDelta ? "none" : "auto";

	return (
		<View style={styles.container} onLayout={handleLayout} {...(panResponder?.panHandlers ?? {})}>
			<Canvas style={StyleSheet.absoluteFill} opaque pointerEvents={canvasPointerEvents}>
				<Room width={width} height={height} light={light} wash={wash} />
				<Group transform={shakeTransform}>
					<Group
						layer={
							frosted ? (
								<Paint>
									<Blur blur={frostSigma} />
								</Paint>
							) : undefined
						}
					>
						<Picture picture={below} />
						<Rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight}>
							<Shader source={MERGE_EFFECT} uniforms={bodyUniforms} />
						</Rect>
						<Picture picture={above} />
					</Group>
				</Group>
				{fading ? (
					<Group layer={<Paint opacity={cover} />}>
						<Room width={width} height={height} light={light} wash={wash} />
					</Group>
				) : null}
			</Canvas>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: INK,
	},
});
