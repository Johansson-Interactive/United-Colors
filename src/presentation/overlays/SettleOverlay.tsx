import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { TiltZero } from "../../domain/types";
import type { PressPoint } from "../components/DotButton";
import { DotButton } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { SettleBowl } from "../components/SettleBowl";
import { BOWL_SIZE, CAPTION, WHITE } from "../theme/theme";
import { type SettlePhase, startSettle, stepSettle } from "../tilt/settle";
import { useTilt } from "../tilt/TiltProvider";
import { useTiltAvailable } from "../tilt/useTiltAvailable";

interface SettleOverlayProps {
	/** Colour of the dot that settles, and of the flood it swells into */
	color: string;
	/** The pose is set; `point` is where the dot rests on screen, for the flood to grow from */
	/** The level pose already set, if any; it must be left before a new hold starts */
	zero: TiltZero | null;
	/** `facingDown`: the side the screen faced, which the pose is for */
	onSettled: (zero: TiltZero, facingDown: boolean, point: PressPoint) => void;
	onBack: () => void;
	/** The moment the dot comes to rest (a sound belongs here) */
	onSnap?: () => void;
}

const CAPTION_LINE_HEIGHT = 20;
/** Time for the ring to snap and pulse before the dot swells into the next screen */
const SNAP_MS = 300;

/** One caption for the whole hold, so it doesn't flicker as a hold starts and breaks */
const HOLD_CAPTION = "hold it the way you like to play\nkeep still, or tap to set now";

const CAPTIONS: Record<SettlePhase, string> = {
	moving: HOLD_CAPTION,
	settling: HOLD_CAPTION,
	settled: "that’s level",
};

/**
 * Setting the level pose. No button and no timer: hold the phone comfortably and the bowl
 * levels itself to your hand; the rest is done the moment the dot comes to rest. Tapping
 * anywhere sets it from the pose just before the finger landed, for the impatient and for
 * devices without a tilt sensor.
 */
export const SettleOverlay: React.FC<SettleOverlayProps> = ({
	color,
	zero,
	onSettled,
	onBack,
	onSnap,
}) => {
	const tilt = useTilt();
	const tiltAvailable = useTiltAvailable();
	const [phase, setPhase] = useState<SettlePhase>("moving");
	const state = useSharedValue(startSettle(zero));
	const bowlRef = useRef<View>(null);
	const doneRef = useRef(false);
	const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const finish = useCallback(
		(zero: TiltZero) => {
			if (doneRef.current) return;
			doneRef.current = true;
			setPhase("settled");
			onSnap?.();
			snapTimerRef.current = setTimeout(() => {
				snapTimerRef.current = null;
				const bowl = bowlRef.current;
				if (!bowl) return;
				bowl.measureInWindow((x, y, width, height) => {
					onSettled(zero, tilt.raw.facingDown.value, { x: x + width / 2, y: y + height / 2 });
				});
			}, SNAP_MS);
		},
		[onSettled, onSnap, tilt],
	);

	useEffect(
		() => () => {
			if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
		},
		[],
	);

	useFrameCallback((info) => {
		if (!tilt.available.value) return;
		const dt = info.timeSincePreviousFrame ?? 16;
		const prev = state.value;
		const next = stepSettle(prev, tilt.raw.x.value, tilt.raw.y.value, dt);
		if (next === prev) return;
		state.value = next;
		if (next.phase !== prev.phase) {
			if (next.phase === "settled") {
				scheduleOnRN(finish, { x: next.meanX, y: next.meanY });
			} else {
				scheduleOnRN(setPhase, next.phase);
			}
		}
	});

	// On press-in rather than release, so the pose comes from before the finger disturbed it
	const handleSetNow = useCallback(() => {
		if (doneRef.current) return;
		const current = state.value;
		const measured = tiltAvailable && current.elapsedMs > 0;
		state.value = { ...current, phase: "settled", progress: 1 };
		finish(measured ? { x: current.meanX, y: current.meanY } : { x: 0, y: 0 });
	}, [state, tiltAvailable, finish]);

	const caption = tiltAvailable ? CAPTIONS[phase] : "no tilt sensor here\ntap to continue";

	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(200)}
		>
			<Pressable
				style={StyleSheet.absoluteFill}
				onPressIn={handleSetNow}
				accessibilityRole="button"
				accessibilityLabel="Set level now"
			/>

			<View style={styles.top} pointerEvents="none">
				<DotMatrixText text="LEVEL" pitch={8} color={WHITE} glow />
			</View>

			<View style={styles.centre} pointerEvents="none">
				<View ref={bowlRef} collapsable={false}>
					<SettleBowl size={BOWL_SIZE} color={color} state={state} />
				</View>
				<Text style={styles.caption}>{caption}</Text>
			</View>

			<View style={styles.footer}>
				<DotButton
					size={80}
					color={WHITE}
					variant="ghost"
					label="BACK"
					labelPitch={3}
					onPress={onBack}
					accessibilityLabel="Back"
				/>
			</View>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFill,
	},
	top: {
		alignItems: "center",
		paddingTop: 52,
	},
	centre: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 28,
	},
	caption: {
		...CAPTION,
		lineHeight: CAPTION_LINE_HEIGHT,
		// Always reserve two lines so a one-line caption doesn't shift the bowl
		minHeight: CAPTION_LINE_HEIGHT * 2,
	},
	footer: {
		alignItems: "center",
		paddingBottom: 44,
	},
});
