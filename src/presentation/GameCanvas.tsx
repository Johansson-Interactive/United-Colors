import {
	Blur,
	Canvas,
	Fill,
	Group,
	Paint,
	Picture,
	Rect,
	Shader,
	Skia,
	type SkPicture,
} from "@shopify/react-native-skia";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type LayoutChangeEvent,
	PanResponder,
	PixelRatio,
	Platform,
	StyleSheet,
	View,
} from "react-native";
import {
	type SharedValue,
	useAnimatedReaction,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { ScreenSize } from "../domain/types";
import { PlaySide, type PortalCut } from "./components/PlaySide";
import type { Burst } from "./effects/burstFrames";
import { FROST_MAX_DIM } from "./effects/portal";
import { useStageBox } from "./layout/StageFrame";
import { recordPicture } from "./recordPicture";
import { ROOM_SKSL, type RoomUniforms, roomUniforms, stageCover } from "./room";
import {
	compileEffect,
	drawBursts,
	drawScene,
	type LiquidBody,
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
	/** How frosted (blurred and dimmed) the play side itself is: 0 = live; the game over dims it */
	frost: SharedValue<number>;
	/**
	 * The pause world (the frozen field, frosted) is drawn under `pauseSide`, and the play side
	 * over it is cut to the portal by `cut` (see stageLook.ts)
	 */
	pauseWorld: boolean;
	cut: PortalCut;
	/** What lies on the pause world, under the play side: the field's touch layer, the pause's content */
	pauseSide: React.ReactNode;
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

/** The room (see room.ts), compiled once */
const ROOM_EFFECT = compileEffect("room", ROOM_SKSL);
const INK_RGB = Array.from(Skia.Color(INK));

interface RoomProps {
	/** The room shader's uniforms: the light follows the tilt, the wash the accent */
	uniforms: SharedValue<RoomUniforms>;
}

/**
 * The room (see room.ts): ink, the light pool and the edge wash, one shader filling the
 * canvas. Drawn as a Skia node driven by a shared value rather than recorded into a picture
 * every frame: a full-screen picture reports hundreds of KB to Hermes as external memory
 * each time it is recorded, which set off a garbage collection on the UI thread nearly every
 * frame. No dither on the paint: the shader dithers itself.
 */
const Room: React.FC<RoomProps> = ({ uniforms }) => (
	<Fill>
		<Shader source={ROOM_EFFECT} uniforms={uniforms} />
	</Fill>
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

interface SceneLayersProps {
	below: SharedValue<SkPicture>;
	drops: SharedValue<WallDropSlot[]>;
	dropGlares: SharedValue<SkPicture>;
	body: SharedValue<LiquidBody>;
	above: SharedValue<SkPicture>;
}

/**
 * The scene in layers with the wall drops and the liquid body between them (see
 * sceneDrawer.ts): drawn on the play side, and again, frozen and frosted, as the pause world
 */
const SceneLayers: React.FC<SceneLayersProps> = ({ below, drops, dropGlares, body, above }) => {
	const bodyX = useDerivedValue(() => body.get().x);
	const bodyY = useDerivedValue(() => body.get().y);
	const bodyWidth = useDerivedValue(() => body.get().width);
	const bodyHeight = useDerivedValue(() => body.get().height);
	const bodyUniforms = useDerivedValue(() => body.get().uniforms);
	return (
		<>
			<Picture picture={below} />
			{DROP_SLOTS.map((slot) => (
				<WallDrop key={slot} drops={drops} slot={slot} />
			))}
			<Picture picture={dropGlares} />
			<Rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight}>
				<Shader source={MERGE_EFFECT} uniforms={bodyUniforms} />
			</Rect>
			<Picture picture={above} />
		</>
	);
};

/** The pause world's frost: the frozen scene blurred this much, and dimmed by FROST_MAX_DIM */
const PAUSE_WORLD_FROST = (
	<Paint>
		<Blur blur={FROST_MAX_SIGMA} />
	</Paint>
);

/** A TextureView on Android, an opaque Metal layer on iOS (see GameCanvas) */
const OPAQUE_CANVAS = Platform.OS !== "android";

/**
 * The stage: the room (see room.ts), then the whole scene, drawn on the UI thread every frame
 * from the `scene` shared value with no React reconciliation per frame: recorded pictures, with
 * the wall drops and the liquid body as shader nodes between them; how the dots are drawn is in
 * sceneDrawer.ts. The light the room and the dots are lit from follows the device tilt, and
 * stands still while the run is frozen or frosted.
 *
 * Pause and play open portals into each other (see portal.ts, ADR 0011), so the stage is in
 * two worlds. The game canvas is the play side, always on top: the live field, sharp, with the
 * bursts over it. While the run is not in play, the pause world lies under it: a second canvas
 * draws the same scene, frozen, blurred and dimmed, with the pause's content (`pauseSide`, plain
 * React Native views) over that, and the game canvas is cut to the portal so the pause shows
 * where the portal leaves it. The pause world is drawn from the frozen frame's own pictures,
 * which stand still while the run is frozen, so it is drawn as it mounts and then left alone:
 * in effect a snapshot, with nothing read back from the screen. In play it is not mounted and
 * the game canvas is not cut, so play pays for neither.
 *
 * The game canvas draws everything behind the interface itself, so in play it can be opaque. On
 * iOS it asks to be, which saves a blend (the installed Skia keeps its layer clear either way).
 * Over the pause world it must not be, or it would hide it. On Android it stays a TextureView: an
 * opaque canvas there is a SurfaceView, whose every frame is a blocking hand-off to
 * SurfaceFlinger on the main thread, which Android 12 can hold for about 5 ms when it arrives
 * early in the period (see docs/android-performance-2026-10-15.md). The stage fade and the shake
 * are drawn here, and so are the bursts over the scene: they shake and fade with it. The game
 * over's blur layer and dim only exist while it is dimmed and the fade cover only while fading,
 * so a live scene pays for none of them. The canvases take no touch: the field's touch layer
 * under the play side gets it (see FieldTouch), except where touch steers the dot in play.
 */
export const GameCanvas: React.FC<GameCanvasProps> = ({
	scene,
	onLayout,
	frost,
	pauseWorld,
	cut,
	pauseSide,
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
	const frozen = useSharedValue(pauseWorld);
	useEffect(() => frozen.set(pauseWorld), [frozen, pauseWorld]);

	// The frost on the play side itself (the game over's dim) is laid on only while it shows
	useAnimatedReaction(
		() => frost.get() > 0.001,
		(current, previous) => {
			if (current !== previous) scheduleOnRN(setFrosted, current);
		},
	);

	// Only track the light while live: frozen or frosted scenes stay still even as the phone moves
	useAnimatedReaction(
		() => ({
			x: tilt.x.get(),
			y: tilt.y.get(),
			still: frozen.get() || frost.get() > 0.001,
		}),
		(current) => {
			if (current.still) return;
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

	// The accent is parsed only when it changes, not with the light every frame
	const accentRgb = useDerivedValue(() => Skia.Color(accent.get()));
	const pixelRatio = PixelRatio.get();
	const room = useDerivedValue(() =>
		roomUniforms(width, height, lightX.get(), lightY.get(), INK_RGB, accentRgb.get(), pixelRatio),
	);

	// The scene's layers (see SceneLayers), each recorded every frame and so into the same
	// recorder each time (see recordPicture.ts)
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

	const frostSigma = useDerivedValue(() => frost.get() * FROST_MAX_SIGMA);
	const frostDim = useDerivedValue(() => frost.get() * FROST_MAX_DIM);
	const shakeTransform = useDerivedValue(() => [{ translateX: shake.get() }]);
	const cover = useDerivedValue(() => stageCover(stageOpacity.get()));

	// Only where touch steers the dot does the stage take a touch; the field's touch layer, under
	// the play side, gets it everywhere else
	const scenePaint = frosted ? (
		<Paint>
			<Blur blur={frostSigma} />
		</Paint>
	) : undefined;

	return (
		<>
			{pauseWorld ? (
				<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
					<Room uniforms={room} />
					<Group layer={PAUSE_WORLD_FROST}>
						<SceneLayers
							below={below}
							drops={drops}
							dropGlares={dropGlares}
							body={body}
							above={above}
						/>
					</Group>
					<Fill color={INK} opacity={FROST_MAX_DIM} />
				</Canvas>
			) : null}
			{pauseSide}
			<View
				style={[styles.container, !pauseWorld && styles.inked]}
				onLayout={handleLayout}
				pointerEvents={panResponder ? "auto" : "none"}
				{...(panResponder?.panHandlers ?? {})}
			>
				<Canvas
					style={StyleSheet.absoluteFill}
					opaque={OPAQUE_CANVAS && !pauseWorld}
					pointerEvents="none"
				>
					<PlaySide cut={pauseWorld ? cut : null}>
						<Room uniforms={room} />
						<Group transform={shakeTransform}>
							<Group layer={scenePaint}>
								<SceneLayers
									below={below}
									drops={drops}
									dropGlares={dropGlares}
									body={body}
									above={above}
								/>
							</Group>
							<Picture picture={burstPicture} />
						</Group>
						{frosted ? <Fill color={INK} opacity={frostDim} /> : null}
						{fading ? (
							<Group layer={<Paint opacity={cover} />}>
								<Room uniforms={room} />
							</Group>
						) : null}
					</PlaySide>
				</Canvas>
			</View>
		</>
	);
};

const styles = StyleSheet.create({
	// The whole stage, over the pause world and its content
	container: {
		...StyleSheet.absoluteFill,
	},
	// In play nothing is under the stage, so it is inked until the canvas first draws
	inked: {
		backgroundColor: INK,
	},
});
