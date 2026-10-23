import { Blur, Canvas, Fill, Group, Paint, Picture, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { type LayoutChangeEvent, PanResponder, Platform, StyleSheet, View } from "react-native";
import { type SharedValue, useAnimatedReaction, useDerivedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { ScreenSize } from "../domain/types";
import { PlaySide } from "./components/PlaySide";
import { FROST_MAX_DIM, FROST_MAX_SIGMA, Room, SceneLayers } from "./components/StageScene";
import type { Burst } from "./effects/burstFrames";
import type { PortalCut } from "./hooks/useStageLook";
import { type StageScene, useRoomUniforms } from "./hooks/useStageScene";
import { recordPicture } from "./recordPicture";
import { stageCover } from "./room";
import { drawBursts } from "./sceneDrawer";
import { INK } from "./theme/theme";

interface GameCanvasProps {
	/** The room and the scene's layers to draw (see useStageScene) */
	stage: StageScene;
	onLayout: (size: ScreenSize) => void;
	/** How frosted (blurred and dimmed) the play side itself is: 0 = live; the game over dims it */
	frost: SharedValue<number>;
	/** How the play side is cut over the pause world (see useStageLook); null in play, with nothing under it */
	cut: PortalCut | null;
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

/** A TextureView on Android, an opaque Metal layer on iOS (see GameCanvas) */
const OPAQUE_CANVAS = Platform.OS !== "android";

/**
 * The play side of the stage: the room, then the whole scene (see useStageScene), with the
 * bursts over it, the live field, sharp. Pause and play open portals into each other (see
 * portal.ts, ADR 0012): while the run is not in play the pause world (see PauseWorld) lies under
 * this, and it is cut by `cut` so the pause shows where the portal leaves it. In play it is not
 * cut, so play pays for no clip.
 *
 * In play nothing is under it, so it draws everything behind the interface itself and can be
 * opaque. On iOS it asks to be, which saves a blend (the installed Skia keeps its layer clear
 * either way). Over the pause world it must not be, or it would hide it. On Android it stays a
 * TextureView: an opaque canvas there is a SurfaceView, whose every frame is a blocking hand-off
 * to SurfaceFlinger on the main thread, which Android 12 can hold for about 5 ms when it arrives
 * early in the period (see docs/android-performance-2026-10-15.md). The stage fade and the shake
 * are drawn here, and so are the bursts over the scene: they shake and fade with it. The game
 * over's blur layer and dim only exist while it is dimmed and the fade cover only while fading,
 * so a live scene pays for none of them. It takes no touch: the field's touch layer under the
 * play side gets it (see FieldTouch), except where touch steers the dot in play.
 */
export const GameCanvas: React.FC<GameCanvasProps> = ({
	stage,
	onLayout,
	frost,
	cut,
	stageOpacity,
	shake,
	bursts,
	burstClock,
	onDragDelta,
}) => {
	const room = useRoomUniforms(stage);
	const [frosted, setFrosted] = useState(false);
	const [fading, setFading] = useState(false);
	const opaque = cut === null;

	// The frost on the play side itself (the game over's dim) is laid on only while it shows
	useAnimatedReaction(
		() => frost.get() > 0.001,
		(current, previous) => {
			if (current !== previous) scheduleOnRN(setFrosted, current);
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

	// Re-recorded only while a burst is alive: the clock stands still otherwise
	const [burstRecorder] = useState(() => Skia.PictureRecorder());
	const burstPicture = useDerivedValue(() =>
		recordPicture(burstRecorder, (canvas) => drawBursts(canvas, bursts.get(), burstClock.get())),
	);

	const frostSigma = useDerivedValue(() => frost.get() * FROST_MAX_SIGMA);
	const frostDim = useDerivedValue(() => frost.get() * FROST_MAX_DIM);
	const shakeTransform = useDerivedValue(() => [{ translateX: shake.get() }]);
	const cover = useDerivedValue(() => stageCover(stageOpacity.get()));

	const scenePaint = frosted ? (
		<Paint>
			<Blur blur={frostSigma} />
		</Paint>
	) : undefined;

	return (
		<View
			style={[styles.container, opaque && styles.inked]}
			onLayout={handleLayout}
			// Only where touch steers the dot does the stage take a touch; the field's touch
			// layer, under the play side, gets it everywhere else
			pointerEvents={panResponder ? "auto" : "none"}
			{...(panResponder?.panHandlers ?? {})}
		>
			<Canvas style={StyleSheet.absoluteFill} opaque={OPAQUE_CANVAS && opaque} pointerEvents="none">
				<PlaySide cut={cut}>
					<Room uniforms={room} />
					<Group transform={shakeTransform}>
						<Group layer={scenePaint}>
							<SceneLayers {...stage.layers} />
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
