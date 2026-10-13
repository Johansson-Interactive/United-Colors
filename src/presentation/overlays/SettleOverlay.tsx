import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import type { TiltZero } from "../../domain/types";
import type { PressPoint } from "../components/DotButton";
import { DotButton } from "../components/DotButton";
import { DotMatrixText } from "../components/DotMatrixText";
import { SettleBowl } from "../components/SettleBowl";
import { BOWL_SIZE, CAPTION, WHITE } from "../theme/theme";
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
	 * The pose is set; `facingDown`: the side the screen faced, which the pose is for;
	 * `point`: where the dot rests on screen, for the flood to grow from
	 */
	onSettled: (zero: TiltZero, facingDown: boolean, point: PressPoint) => void;
	onBack: () => void;
	/** The moment the dot comes to rest (a sound belongs here) */
	onSnap?: () => void;
}

const CAPTION_LINE_HEIGHT = 20;
/** Time for the ring to snap and pulse before the dot swells into the next screen */
const SNAP_MS = 300;

/** How far the bowl dims while it waits to be started */
const WAITING_DIM = 0.7;
const START_FADE_MS = 250;

/** One caption for the whole hold, so it doesn't flicker as a hold starts and breaks */
const HOLD_CAPTION = "keep still\nor tap to set now";

const CAPTIONS: Record<SettlePhase, string> = {
	waiting: "hold it the way you like to play\nthen tap start and keep still",
	moving: HOLD_CAPTION,
	settling: HOLD_CAPTION,
	settled: "that’s level",
};

/**
 * Setting the level pose. The bowl opens dimmed under START, its dot already rolling with the
 * hand, so there is time to read what to do. Once started there is no timer: hold the phone
 * comfortably and the bowl levels itself to your hand; the rest is done the moment the dot
 * comes to rest. Tapping anywhere then sets it from the pose just before the finger landed,
 * for the impatient. Without a tilt sensor, START sets a flat pose straight away.
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
	// 1 while waiting to be started: the bowl is dimmed and START shows over it
	const waiting = useSharedValue(1);
	const bowlRef = useRef<View>(null);
	const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const finish = useCallback(
		({ zero, facingDown }: SettleOutcome) => {
			setPhase("settled");
			onSnap?.();
			snapTimerRef.current = setTimeout(() => {
				snapTimerRef.current = null;
				const bowl = bowlRef.current;
				if (!bowl) return;
				bowl.measureInWindow((x, y, width, height) => {
					onSettled(zero, facingDown, { x: x + width / 2, y: y + height / 2 });
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
			// A started hold lifts START; without a sensor it stays up through the snap
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
		advance(
			stepSettle(state.get(), tilt.raw.x.get(), tilt.raw.y.get(), tilt.raw.facingDown.get(), dt),
		);
	});

	// On press-in rather than release, so the pose comes from before the finger disturbed it
	const handleSetNow = useCallback(() => {
		scheduleOnUI(() => {
			"worklet";
			advance(setSettleNow(state.get(), tilt.raw.facingDown.get()));
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

	const caption = tiltAvailable ? CAPTIONS[phase] : "no tilt sensor here\ntap start to continue";
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

			<View style={styles.centre} pointerEvents="box-none">
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
						<DotMatrixText text="START" pitch={6} color={WHITE} glow />
					</Animated.View>
				</Pressable>
				<Text style={styles.caption} pointerEvents="none">
					{caption}
				</Text>
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
	start: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
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
