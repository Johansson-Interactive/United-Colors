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
import type { Portal } from "../effects/portal";
import { useStageBox } from "../layout/StageFrame";
import {
	type BloomFrame,
	type BloomStart,
	bloomFrame,
	bloomHeld,
	OPEN_BLOOM,
	stepBloom,
} from "../touch/bloom";
import type { FieldTouchState } from "../touch/fieldTouch";

interface BloomOverlayProps {
	/** The frozen scene, for the seat: the portal opens around the player dot where it froze */
	scene: SharedValue<Float32Array>;
	/** The player's colour, which the rim wears */
	color: string;
	/** What started the bloom: a finger, whose hold it follows, or the dev pause dot */
	start: BloomStart;
	/** Whether the finger is still down, as the field touch layer keeps it */
	touch: SharedValue<FieldTouchState>;
	/** How the stage's corners are rounded (null: square) */
	corners: Corners | null;
	/** The portal, which this drives while the bloom runs */
	portal: SharedValue<Portal>;
	/** Fired once, the moment the portal has covered the field */
	onCovered: () => void;
	/** Fired once, when a lifted finger's portal has drained back into the dot */
	onCleared: () => void;
}

/** Before the first frame is stepped nothing is drawn */
const BEFORE_FIRST_FRAME: BloomFrame = {
	edge: { x: 0, y: 0, radius: 0, inside: "pause" },
	rim: 0,
};

/**
 * The bloom (see bloom.ts): the portal into the pause opening at the seat, where the player
 * dot froze, its edge wearing the rim in the player's colour. The run is already frozen; this
 * only shows the portal covering it, or draining back into the dot if the finger lifts first. The rules live in
 * the bloom stepper: each frame, on the UI thread, this takes one step of it and copies what
 * it says to draw. The frost itself is cut by the game canvas, which this drives through
 * `portal`; the edge it leaves behind is the stepper's last word, covered or clear, so the
 * frost coming on or lifting behind it goes unseen.
 */
export const BloomOverlay: React.FC<BloomOverlayProps> = ({
	scene,
	color,
	start,
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
		const held = bloomHeld(start, touch.get().down);
		const next = stepBloom(prev, held, info.timeSincePreviousFrame ?? 16);
		// Once over the stepper answers with the same state, and there is nothing new to copy
		if (next === prev) return;
		state.set(next);
		const now = bloomFrame(next, playerDisc(scene.get()), field);
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
