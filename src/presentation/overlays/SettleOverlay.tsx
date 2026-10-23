import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import type { Gravity, PoseSide } from "../../domain/types";
import { BowlStage } from "../components/BowlStage";
import type { PressPoint } from "../components/DotButton";
import { DotButton } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { SettleBowl } from "../components/SettleBowl";
import { BOWL_SIZE, WHITE } from "../theme/theme";
import {
	type SettleOutcome,
	type SettlePhase,
	type SettleState,
	setSettleNow,
	settleOutcome,
	startSettle,
	stepSettle,
	WAITING_SETTLE,
} from "../tilt/settle";
import { useTilt } from "../tilt/TiltProvider";
import { useTiltAvailable } from "../tilt/useTiltAvailable";

interface SettleOverlayProps {
	/** Colour of the dot that settles, and of the flood it swells into */
	color: string;
	/**
	 * The pose is set; `side`: the level pose it replaces (see levelTilt);
	 * `point`: where the dot rests on screen, for the flood to grow from
	 */
	onSettled: (pose: Gravity, side: PoseSide, point: PressPoint) => void;
	onBack: () => void;
	/** The moment the dot comes to rest (a sound belongs here) */
	onSnap?: () => void;
}

/** Time for the ring to snap and pulse before the dot swells into the next screen */
const SNAP_MS = 300;

/** How far the bowl dims while it waits to be started */
const WAITING_DIM = 0.7;
const START_FADE_MS = 250;

/** One caption for the whole hold, so it doesn't flicker as a hold starts and breaks */
const HOLD_CAPTION = "keep still\nor tap to set now";

const CAPTIONS: Record<SettlePhase, string> = {
	waiting: "hold it the way you like to play\ntap, then keep still",
	moving: HOLD_CAPTION,
	settling: HOLD_CAPTION,
	settled: "that’s level",
};

/**
 * Setting the level pose. The bowl opens dimmed under TAP, its dot already rolling with the
 * hand, so there is time to read what to do. Once started there is no timer: hold the phone
 * comfortably and the bowl levels itself to your hand; the rest is done the moment the dot
 * comes to rest. Tapping anywhere then sets it from the pose just before the finger landed,
 * for the impatient. Without a tilt sensor, TAP sets a flat pose straight away.
 *
 * The rules live in the settle stepper; every step, start and tap goes through it on the UI
 * thread, where the tilt is, so the pose and its side are read together and the settled state
 * is reached once. The overlay passes the outcome on after the snap.
 */
export const SettleOverlay: React.FC<SettleOverlayProps> = ({
	color,
	onSettled,
	onBack,
	onSnap,
}) => {
	const tilt = useTilt();
	const tiltAvailable = useTiltAvailable();
	const [phase, setPhase] = useState<SettlePhase>("waiting");
	const state = useSharedValue(WAITING_SETTLE);
	// 1 while waiting to be started: the bowl is dimmed and TAP shows over it
	const waiting = useSharedValue(1);
	const bowlRef = useRef<View>(null);
	const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const finish = useCallback(
		({ pose, side }: SettleOutcome) => {
			setPhase("settled");
			onSnap?.();
			snapTimerRef.current = setTimeout(() => {
				snapTimerRef.current = null;
				const bowl = bowlRef.current;
				if (!bowl) return;
				bowl.measureInWindow((x, y, width, height) => {
					onSettled(pose, side, { x: x + width / 2, y: y + height / 2 });
				});
			}, SNAP_MS);
		},
		[onSettled, onSnap],
	);

	useEffect(
		() => () => {
			if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
		},
		[],
	);

	// UI thread only: settled is final in the stepper, so `finish` runs once
	const advance = useCallback(
		(next: SettleState) => {
			"worklet";
			const prev = state.get();
			if (next === prev) return;
			state.set(next);
			if (next.phase === prev.phase) return;
			// A started hold lifts TAP; without a sensor it stays up through the snap
			if (next.phase === "moving") waiting.set(withTiming(0, { duration: START_FADE_MS }));
			const outcome = settleOutcome(next);
			if (outcome) scheduleOnRN(finish, outcome);
			else scheduleOnRN(setPhase, next.phase);
		},
		[state, waiting, finish],
	);

	useFrameCallback((info) => {
		if (!tilt.available.get()) return;
		const dt = info.timeSincePreviousFrame ?? 16;
		const { attitude, side } = tilt.reading.get();
		advance(stepSettle(state.get(), attitude, side, dt));
	});

	// On press-in rather than release, so the pose comes from before the finger disturbed it
	const handleSetNow = useCallback(() => {
		scheduleOnUI(() => {
			"worklet";
			advance(setSettleNow(state.get(), tilt.reading.get().side));
		});
	}, [advance, state, tilt]);

	const handleStart = useCallback(() => {
		scheduleOnUI(() => {
			"worklet";
			advance(startSettle(state.get(), tilt.available.get()));
		});
	}, [advance, state, tilt]);

	const startStyle = useAnimatedStyle(() => ({ opacity: waiting.get() }));
	const dim = useDerivedValue(() => waiting.get() * WAITING_DIM);

	const caption = tiltAvailable ? CAPTIONS[phase] : "no tilt sensor here\ntap to continue";
	const isWaiting = phase === "waiting";

	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(200)}
		>
			<Pressable
				style={StyleSheet.absoluteFill}
				onPressIn={handleSetNow}
				disabled={isWaiting}
				accessibilityRole="button"
				accessibilityLabel="Calibrate now"
			/>

			<View style={styles.top} pointerEvents="none">
				<DotMatrixText text="CALIBRATE" pitch={6} color={WHITE} glow />
			</View>

			<BowlStage caption={caption}>
				<Pressable
					ref={bowlRef}
					collapsable={false}
					onPress={handleStart}
					pointerEvents={isWaiting ? "auto" : "none"}
					accessibilityRole="button"
					accessibilityLabel="Start calibrating"
					accessibilityElementsHidden={!isWaiting}
				>
					<SettleBowl size={BOWL_SIZE} color={color} state={state} dim={dim} />
					<Animated.View style={[styles.start, startStyle]} pointerEvents="none">
						<DotMatrixText text="TAP" pitch={6} color={WHITE} glow />
					</Animated.View>
				</Pressable>
			</BowlStage>

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
	start: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
	},
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		paddingBottom: 44,
	},
});
