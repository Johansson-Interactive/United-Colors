import { Canvas, vec } from "@shopify/react-native-skia";
import type React from "react";
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import {
	type SharedValue,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { playerDisc } from "../../application/sceneRecord";
import { cornerExtent } from "../../domain/arena";
import type { Corners } from "../../domain/types";
import { PortalRim } from "../components/PortalRim";
import type { Point, Portal } from "../effects/portal";
import { useStageBox } from "../layout/StageFrame";
import type { FieldTouchState } from "../touch/fieldTouch";
import { type BloomFrame, bloomFrame, OPEN_BLOOM, stepBloom } from "../touch/frostBloom";

interface FrostBloomOverlayProps {
	/** The frozen scene, for the player dot's size: the edge opens at the rest size around it */
	scene: SharedValue<Float32Array>;
	/** The player's colour, which the rim wears */
	color: string;
	/** Where the finger landed (stage px): the frost grows from here */
	origin: Point;
	/** Whether the finger is still down, as the field touch layer keeps it */
	touch: SharedValue<FieldTouchState>;
	/** How the stage's corners are rounded (null: square) */
	corners: Corners | null;
	/** The frost's edge, which this drives while the bloom runs */
	portal: SharedValue<Portal>;
	/** Fired once, the moment the frost has covered the field */
	onCovered: () => void;
	/** Fired once, when a lifted finger's frost has drained away */
	onCleared: () => void;
}

/** Before the first frame is stepped nothing is drawn */
const BEFORE_FIRST_FRAME: BloomFrame = {
	edge: { x: 0, y: 0, radius: 0, inside: "pause" },
	rim: 0,
};

/**
 * The bloom (see frostBloom.ts): the frost growing out from under the finger that paused the
 * run, its edge wearing the rim in the player's colour. The run is already frozen; this only
 * shows the frost covering it, or draining back if the finger lifts first. The rules live in
 * the bloom stepper: each frame, on the UI thread, this takes one step of it and copies what
 * it says to draw. The frost itself is cut by the game canvas, which this drives through
 * `portal`; the edge it leaves behind is the stepper's last word, covered or clear, so the
 * frost coming on or lifting behind it goes unseen.
 */
export const FrostBloomOverlay: React.FC<FrostBloomOverlayProps> = ({
	scene,
	color,
	origin,
	touch,
	corners,
	portal,
	onCovered,
	onCleared,
}) => {
	const { width, height } = useStageBox();
	const field = useMemo(
		() => ({
			width,
			height,
			cornerExtent: cornerExtent({ width, height, corners: corners ?? undefined }),
		}),
		[width, height, corners],
	);
	const state = useSharedValue(OPEN_BLOOM);
	const frame = useSharedValue(BEFORE_FIRST_FRAME);

	useFrameCallback((info) => {
		const prev = state.get();
		const next = stepBloom(prev, touch.get().down, info.timeSincePreviousFrame ?? 16);
		// Once over the stepper answers with the same state, and there is nothing new to copy
		if (next === prev) return;
		state.set(next);
		const now = bloomFrame(next, origin, playerDisc(scene.get())?.radius ?? 0, field);
		frame.set(now);
		portal.set(now.edge);
		if (next.outcome === "covered") scheduleOnRN(onCovered);
		if (next.outcome === "cleared") scheduleOnRN(onCleared);
	});

	const centre = useDerivedValue(() => vec(frame.get().edge.x, frame.get().edge.y));
	const radius = useDerivedValue(() => frame.get().edge.radius);
	const rim = useDerivedValue(() => frame.get().rim);

	return (
		<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
			<PortalRim centre={centre} radius={radius} opacity={rim} color={color} />
		</Canvas>
	);
};
