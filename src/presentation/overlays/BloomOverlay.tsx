import { Canvas, vec } from "@shopify/react-native-skia";
import type React from "react";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { type SharedValue, useDerivedValue } from "react-native-reanimated";
import { playerDisc } from "../../application/sceneRecord";
import type { Corners } from "../../domain/types";
import { PortalRim } from "../components/PortalRim";
import { type Portal, seatOf } from "../effects/portal";
import { useFieldSize } from "../hooks/useFieldSize";
import { usePortalStepper } from "../hooks/usePortalStepper";
import {
	advanceBloom,
	type BloomEnd,
	type BloomStart,
	type BloomState,
	bloomHeld,
	bloomOrigin,
	openBloom,
} from "../touch/bloom";
import type { FieldTouchState } from "../touch/fieldTouch";

interface BloomOverlayProps {
	/** The frozen scene, for the seat: the dev pause dot's portal opens around the player dot where it froze */
	scene: SharedValue<Float32Array>;
	/** The player's colour, which the rim wears */
	color: string;
	/**
	 * What started the bloom: a finger, whose hold it follows until a finger lands again, or a
	 * second touch or the dev pause dot, which play out whole
	 */
	start: BloomStart;
	/** Where and when the finger landed and whether it is still down, as the field touch layer keeps it */
	touch: SharedValue<FieldTouchState>;
	/** How the stage's corners are rounded (null: square) */
	corners: Corners | null;
	/** The portal, which this drives while the bloom runs */
	portal: SharedValue<Portal>;
	/**
	 * Fired once, as the bloom ends: the moment the portal has covered the field, or when a
	 * lifted finger's portal has drained back into the fingertip
	 */
	onEnd: (end: BloomEnd) => void;
}

/**
 * The bloom (see bloom.ts): the portal into the pause opening under the finger, its edge wearing
 * the rim in the player's colour. The run is already frozen; this only shows the portal covering
 * it, or draining back into the fingertip if the finger lifts first.
 * The rules live in the bloom stepper, which usePortalStepper runs a step a frame on the UI
 * thread. The portal itself is cut by the play side's canvases (see PlaySide), which the
 * stepper drives through `portal`, over the pause world; the rim on its edge is drawn here, over
 * both worlds. The first frame is worked out as this mounts, so it is drawn from the very first
 * frame.
 */
export const BloomOverlay: React.FC<BloomOverlayProps> = ({
	scene,
	color,
	start,
	touch,
	corners,
	portal,
	onEnd,
}) => {
	const field = useFieldSize(corners);
	// Where the finger landed, or for the pause dot the seat in the frozen scene, and when the
	// finger landed, which a finger landing again replaces, for the bloom's life
	const [{ origin, openedOn }] = useState(() => {
		const opened = touch.get();
		const seat = seatOf(playerDisc(scene.get()), field);
		return { origin: bloomOrigin(start, opened, seat), openedOn: opened.landedAt };
	});
	const advance = (state: BloomState, dt: number) => {
		"worklet";
		return advanceBloom(state, bloomHeld(start, touch.get(), openedOn), dt, origin, field);
	};
	const frame = usePortalStepper(() => openBloom(origin, field), advance, portal, onEnd);

	const centre = useDerivedValue(() => vec(frame.get().portal.x, frame.get().portal.y));
	const radius = useDerivedValue(() => frame.get().portal.radius);
	const rim = useDerivedValue(() => frame.get().rim);

	return (
		<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
			<PortalRim centre={centre} radius={radius} opacity={rim} color={color} />
		</Canvas>
	);
};
