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
import { type LayoutChangeEvent, PanResponder, Platform, StyleSheet, View } from "react-native";
import {
	type SharedValue,
	useAnimatedReaction,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { ScreenSize } from "../domain/types";
import type { Burst } from "./effects/burstFrames";
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
import {
	drawBursts,
	drawScene,
	liquidBody,
	MERGE_EFFECT,
	WALL_DROP_EFFECT,
	wallDrops,
} from "./sceneDrawer";
import { INK } from "./theme/theme";
import { useTilt } from "./tilt/TiltProvider";
import { WALL_DROP_SLOTS, type WallDropSlot } from "./wallDropShader";

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
	/** The score pops and rings alive, drawn at `burstClock`, the frame time (see burstFrames.ts) */
	bursts: SharedValue<Burst[]>;
	burstClock: SharedValue<number>;
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

/** The wall drop slots, by index (see wallDrops) */
const DROP_SLOTS = Array.from({ length: WALL_DROP_SLOTS }, (_, i) => i);

interface WallDropProps {
	drops: SharedValue<WallDropSlot[]>;
	slot: number;
}

/** One wall drop slot (see wallDrops): the wall drop shader over the drop's rect, empty if unused */
const WallDrop: React.FC<WallDropProps> = ({ drops, slot }) => {
	const rect = useDerivedValue(() => {
		const drop = drops.get()[slot];
		return Skia.XYWHRect(drop.x, drop.y, drop.width, drop.height);
	});
	const uniforms = useDerivedValue(() => drops.get()[slot].uniforms);
	return (
		<Rect rect={rect}>
			<Shader source={WALL_DROP_EFFECT} uniforms={uniforms} />
		</Rect>
	);
};

/** A TextureView on Android, an opaque Metal layer on iOS (see GameCanvas) */
const OPAQUE_CANVAS = Platform.OS !== "android";

/**
 * The game canvas: the room (see room.ts), then the whole scene, drawn on the UI thread every
 * frame from the `scene` shared value with no React reconciliation per frame: recorded
 * pictures, with the wall drops and the liquid body as shader nodes between them; how the dots
 * are drawn is in sceneDrawer.ts. The light the room and the dots are lit
 * from follows the device tilt, and freezes while frosted.
 *
 * The canvas draws everything behind the interface itself, so it can be opaque. On iOS it is,
 * which saves a blend. On Android it stays a TextureView: an opaque canvas there is a
 * SurfaceView, whose every frame is a blocking hand-off to SurfaceFlinger on the main thread,
 * which Android 12 can hold for about 5 ms when it arrives early in the period (see
 * docs/android-performance-2026-10-15.md). The stage fade and the shake are drawn here, and so
 * are the bursts over the scene: they shake and fade with it but stay sharp while it frosts.
 * The blur layer only exists while frosted and the fade cover only while fading, so a live
 * scene pays for neither.
 */
export const GameCanvas: React.FC<GameCanvasProps> = ({
	scene,
	onLayout,
	frost,
	accent,
	stageOpacity,
	shake,
	bursts,
	burstClock,
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

	// The scene in layers with the wall drops and the liquid body between them (see
	// sceneDrawer.ts), each recorded every frame and so into the same recorder each time (see
	// recordPicture.ts)
	const [belowRecorder] = useState(() => Skia.PictureRecorder());
	const [dropsRecorder] = useState(() => Skia.PictureRecorder());
	const [aboveRecorder] = useState(() => Skia.PictureRecorder());
	const below = useDerivedValue(() =>
		recordPicture(belowRecorder, (canvas) =>
			drawScene(canvas, scene.get(), lightX.get(), lightY.get(), "below"),
		),
	);
	const dropGlares = useDerivedValue(() =>
		recordPicture(dropsRecorder, (canvas) =>
			drawScene(canvas, scene.get(), lightX.get(), lightY.get(), "drops"),
		),
	);
	const above = useDerivedValue(() =>
		recordPicture(aboveRecorder, (canvas) =>
			drawScene(canvas, scene.get(), lightX.get(), lightY.get(), "above"),
		),
	);
	// Re-recorded only while a burst is alive: the clock stands still otherwise
	const [burstRecorder] = useState(() => Skia.PictureRecorder());
	const burstPicture = useDerivedValue(() =>
		recordPicture(burstRecorder, (canvas) => drawBursts(canvas, bursts.get(), burstClock.get())),
	);
	const drops = useDerivedValue(() => wallDrops(scene.get()));
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
			<Canvas
				style={StyleSheet.absoluteFill}
				opaque={OPAQUE_CANVAS}
				pointerEvents={canvasPointerEvents}
			>
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
						{DROP_SLOTS.map((slot) => (
							<WallDrop key={slot} drops={drops} slot={slot} />
						))}
						<Picture picture={dropGlares} />
						<Rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight}>
							<Shader source={MERGE_EFFECT} uniforms={bodyUniforms} />
						</Rect>
						<Picture picture={above} />
					</Group>
					<Picture picture={burstPicture} />
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
	// The whole stage, under the interface
	container: {
		...StyleSheet.absoluteFill,
		backgroundColor: INK,
	},
});
