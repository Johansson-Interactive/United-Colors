import { Canvas, Circle, Group, vec } from "@shopify/react-native-skia";
import type React from "react";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	type SharedValue,
	useAnimatedStyle,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { playerDisc } from "../../application/sceneRecord";
import { cornerExtent } from "../../domain/arena";
import type { Corners } from "../../domain/types";
import { DotMatrixText } from "../components/DotMatrixText";
import { layoutDotMatrix, pitchToFit } from "../dotmatrix/layout";
import { useStageBox } from "../layout/StageFrame";
import {
	INITIAL_GET_READY,
	isHolding,
	outlineCentre,
	ringRadius,
	stepGetReady,
} from "../tilt/getReady";
import { useTilt } from "../tilt/TiltProvider";

interface GetReadyOverlayProps {
	/** The frozen scene, for where the player dot is drawn and how big */
	scene: SharedValue<Float32Array>;
	/** The player's colour: the ring, the outline and the caption wear it */
	color: string;
	/** The outline moves this many times its usual distance per tilt, like the player dot */
	sensitivity: number;
	/** How the stage's corners are rounded, so the outline slides round them (null: square) */
	corners: Corners | null;
	/** Fired once, the moment the ring closes on the dot */
	onReady: () => void;
}

const CAPTION = "HOLD LEVEL";
/** The caption's pitch where it fits, the same as the PAUSED it stands in for */
const CAPTION_PITCH = 8;
/** Room the caption keeps from the stage's sides */
const CAPTION_MARGIN = 48;
const STROKE = 2;
const CAPTION_FADE_MS = 250;

/**
 * Get ready: over the unfrosted frozen field, a ring sits around the player dot and a hollow
 * outline of the dot follows the tilt. Holding the outline on the dot contracts the ring onto
 * it, and the moment it closes play resumes. One caption says what to do; it fades while the
 * player holds and comes back when the hold breaks. Taps go through to nothing.
 *
 * The rules live in the get-ready stepper, run here on the UI thread where the tilt is.
 */
export const GetReadyOverlay: React.FC<GetReadyOverlayProps> = ({
	scene,
	color,
	sensitivity,
	corners,
	onReady,
}) => {
	const tilt = useTilt();
	const { width, height } = useStageBox();
	const field = useMemo(
		() => ({
			width,
			height,
			cornerExtent: cornerExtent({ width, height, corners: corners ?? undefined }),
		}),
		[width, height, corners],
	);
	const state = useSharedValue(INITIAL_GET_READY);
	const holding = useSharedValue(false);
	// The caption's opacity: up until the hold grows, back as soon as it breaks
	const caption = useSharedValue(1);

	useFrameCallback((info) => {
		const prev = state.get();
		const next = stepGetReady(prev, tilt.x.get(), tilt.y.get(), info.timeSincePreviousFrame ?? 16);
		// Once fired the stepper answers with the same state, so this fires once
		if (next === prev) return;
		state.set(next);
		const nowHolding = isHolding(prev, next);
		if (nowHolding !== holding.get()) {
			holding.set(nowHolding);
			caption.set(withTiming(nowHolding ? 0 : 1, { duration: CAPTION_FADE_MS }));
		}
		if (next.fired) scheduleOnRN(onReady);
	});

	// With no player in the scene (it should always have one here) nothing is drawn
	const disc = useDerivedValue(() => playerDisc(scene.get()));
	const shown = useDerivedValue(() => (disc.get() ? 1 : 0));
	const dotCentre = useDerivedValue(() => {
		const d = disc.get();
		return d ? vec(d.x, d.y) : vec(0, 0);
	});
	const dotRadius = useDerivedValue(() => disc.get()?.radius ?? 0);
	const ring = useDerivedValue(() => ringRadius(state.get().progress, dotRadius.get()));
	const outline = useDerivedValue(() => {
		const d = disc.get();
		if (!d) return vec(0, 0);
		const at = outlineCentre(
			{ x: d.x, y: d.y, radius: d.radius + STROKE / 2 },
			{ x: tilt.x.get(), y: tilt.y.get() },
			sensitivity,
			field,
		);
		return vec(at.x, at.y);
	});

	const captionPitch = useMemo(
		() => pitchToFit(layoutDotMatrix(CAPTION), width - CAPTION_MARGIN, CAPTION_PITCH),
		[width],
	);
	const captionStyle = useAnimatedStyle(() => ({ opacity: caption.get() }));

	return (
		<Animated.View
			style={StyleSheet.absoluteFill}
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(150)}
			pointerEvents="none"
		>
			<Canvas style={StyleSheet.absoluteFill}>
				<Group opacity={shown}>
					<Circle c={dotCentre} r={ring} color={color} style="stroke" strokeWidth={STROKE} />
					<Circle c={outline} r={dotRadius} color={color} style="stroke" strokeWidth={STROKE} />
				</Group>
			</Canvas>
			<View style={styles.top}>
				<Animated.View style={captionStyle}>
					<DotMatrixText text={CAPTION} pitch={captionPitch} color={color} glow />
				</Animated.View>
			</View>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	top: {
		alignItems: "center",
		paddingTop: 52,
	},
});
