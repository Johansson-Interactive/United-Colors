import type React from "react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	type SharedValue,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import { runClock } from "../../domain/run";
import { layoutDotMatrix, matrixBox } from "../dotmatrix/layout";
import {
	middlePitch,
	middleSpot,
	type ScoreScreen,
	scoreMotion,
	sinkPlan,
	TIME_PITCH,
} from "../effects/scoreSink";
import { shownScore } from "../effects/scoreTally";
import type { ScoreTally } from "../hooks/useScoreTally";
import { useStageBox } from "../layout/StageFrame";
import { WHITE } from "../theme/theme";
import { DotMatrixText } from "./DotMatrixText";

interface PausedScoreProps {
	/** The run time so far is read here while the run is paused */
	store: GameStore;
	/** The player's colour; the score wears it, never combo amber, as nothing counts while paused */
	color: SharedValue<string>;
	/** The screen showing; its changes play the sink, the rise and the fades (see scoreSink.ts) */
	screen: ScoreScreen;
	/**
	 * The score's tally (see useScoreTally): the score shown is the one the HUD showed, without
	 * the slivers frozen in the air, so nothing jumps between the two
	 */
	score: ScoreTally;
}

const SINK_EASING = Easing.inOut(Easing.cubic);
const FADE_EASING = Easing.out(Easing.quad);

/**
 * The paused run's score and run time, over the pause's middle: the score sinks in from the
 * HUD's spot and swells as the pause opens, the time pops in under it, and the score rises
 * back to wait dimmed at the top through Get ready (see scoreSink.ts for the rules). It stays
 * mounted, clear, on every other screen, so it sees each change; it follows the HUD's tally
 * only while the run is paused, so a catch in play re-records nothing here.
 */
export const PausedScore: React.FC<PausedScoreProps> = ({
	store,
	color,
	screen,
	score: { tally, clock: tallyClock },
}) => {
	const { width, height } = useStageBox();
	const insets = useSafeAreaInsets();
	// The stage's own height: the interface layer keeps clear of the home indicator
	const stageHeight = height - insets.bottom;
	const paused = useStore(store, (s) => s.frame.phase === "PAUSED");
	const ticks = useStore(store, (s) => (s.frame.phase === "PAUSED" ? s.frame.runTicks : 0));
	// The score as the HUD shows it, which stands still while paused; followed only then, so a
	// catch in play renders nothing here
	const [score, setScore] = useState(0);
	useAnimatedReaction(
		() => (paused ? shownScore(tally.get(), tallyClock.get()) : 0),
		(shown, previous) => {
			if (shown !== previous) scheduleOnRN(setScore, shown);
		},
		[paused],
	);
	const pitch = useMemo(() => middlePitch(score, width), [score, width]);
	const text = String(score);
	const scoreBox = useMemo(
		() => matrixBox(layoutDotMatrix(text), pitch, true, false),
		[text, pitch],
	);
	const clock = runClock(ticks);
	const timeBox = useMemo(
		() => matrixBox(layoutDotMatrix(clock), TIME_PITCH, false, false),
		[clock],
	);
	const timeY = middleSpot(stageHeight, pitch).timeY;

	const y = useSharedValue(0);
	const scale = useSharedValue(1);
	const opacity = useSharedValue(0);
	const timeOpacity = useSharedValue(0);
	const timeReveal = useSharedValue(1);

	// Each change of screen plays its motion from where the score is to where it goes, with
	// the geometry as it stands then; where there is nothing to play the score is clear at once
	const previous = useRef<ScoreScreen | null>(null);
	const play = useEffectEvent((next: ScoreScreen) => {
		const motion = scoreMotion(previous.current, next);
		previous.current = next;
		// Sized for the score as the HUD shows it now, which the text may still be catching up to
		const shown = shownScore(tally.get(), tallyClock.get());
		const plan = sinkPlan(motion, stageHeight, middlePitch(shown, width));
		for (const value of [y, scale, opacity, timeOpacity, timeReveal]) cancelAnimation(value);
		if (!plan) {
			opacity.set(0);
			timeOpacity.set(0);
			return;
		}
		const easing = motion === "sink" || motion === "rise" ? SINK_EASING : FADE_EASING;
		y.set(plan.from.y);
		scale.set(plan.from.scale);
		opacity.set(plan.from.opacity);
		y.set(withTiming(plan.to.y, { duration: plan.ms, easing }));
		scale.set(withTiming(plan.to.scale, { duration: plan.ms, easing }));
		opacity.set(withTiming(plan.to.opacity, { duration: plan.ms, easing }));
		const { time } = plan;
		if (time.reveal) {
			timeOpacity.set(1);
			timeReveal.set(0);
			timeReveal.set(
				withDelay(time.delayMs, withTiming(1, { duration: time.ms, easing: Easing.linear })),
			);
		} else {
			timeReveal.set(1);
			timeOpacity.set(
				withDelay(
					time.delayMs,
					withTiming(time.opacity, { duration: time.ms, easing: FADE_EASING }),
				),
			);
		}
	});
	useEffect(() => play(screen), [screen]);

	const scoreStyle = useAnimatedStyle(() => ({
		opacity: opacity.get(),
		transform: [{ translateY: y.get() - scoreBox.height / 2 }, { scale: scale.get() }],
	}));
	const timeStyle = useAnimatedStyle(() => ({ opacity: timeOpacity.get() }));

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			<Animated.View style={[styles.row, scoreStyle]}>
				<DotMatrixText text={text} pitch={pitch} color={color} glow />
			</Animated.View>
			<Animated.View style={[styles.row, { top: timeY - timeBox.height / 2 }, timeStyle]}>
				<DotMatrixText text={clock} pitch={TIME_PITCH} color={WHITE} reveal={timeReveal} />
			</Animated.View>
		</View>
	);
};

const styles = StyleSheet.create({
	row: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		alignItems: "center",
	},
});
