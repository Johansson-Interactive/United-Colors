import { Canvas, Picture, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type FrameCallback,
	type FrameInfo,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import { onGameEvents } from "../../application/gameEvents";
import { createBurstIds } from "../effects/burstFrames";
import {
	advanceTally,
	createTally,
	newCatch,
	SCORE_PAD,
	SCORE_PITCH,
	type Tally,
	type TallyStyle,
	tallyIdle,
	withCatch,
} from "../effects/scoreTally";
import { useStageBox } from "../layout/StageFrame";
import { recordPicture } from "../recordPicture";
import { drawTally } from "../sceneDrawer";
import { payColor, WHITE } from "../theme/theme";

interface ScoreMeterProps {
	/** The score and its catches are read here, so a catch re-renders nothing */
	store: GameStore;
	/** The player's current colour; the total wears it so a switch is always visible */
	color: string;
}

/** Which way the total takes its catches in (see scoreTally.ts) */
const STYLE: TallyStyle = "feed";
/** The meter's height: the total and a few lines of addends under it */
const METER_HEIGHT = 230;

/**
 * The score at the top of the stage, counting each catch in as it arrives (see scoreTally.ts).
 * Nothing here goes through React: a catch is queued on the UI thread, which stamps, ages and
 * drops it each frame while anything moves, and the picture is recorded there at the frame
 * time. The clock runs only while something moves.
 */
export const ScoreMeter: React.FC<ScoreMeterProps> = ({ store, color }) => {
	// Memoised by hand, not by the React Compiler, as useStageEffects is: it reads the frame
	// callback's worklet factory as a call that may change the shared values
	"use no memo";
	const { width } = useStageBox();
	const geometry = useMemo(() => ({ cx: width / 2, cy: SCORE_PAD + SCORE_PITCH * 3.5 }), [width]);
	const scoreColor = useMemo(() => Skia.Color(color), [color]);

	const tally = useSharedValue<Tally>(createTally(store.getState().frame.score));
	const clock = useSharedValue(0);
	/** The newest catch the UI thread has seen, so a stop sent before a newer one is ignored */
	const seen = useSharedValue(-1);
	const [ids] = useState(createBurstIds);

	// Stops the clock once the UI thread has nothing moving, unless a catch was added since
	const clockRef = useRef<FrameCallback | null>(null);
	const stopClock = useCallback(
		(seenId: number) => {
			if (ids.isNewest(seenId)) clockRef.current?.setActive(false);
		},
		[ids],
	);

	// Stamps, schedules and drops the catches each frame while anything moves
	const onFrame = useCallback(
		(frame: FrameInfo) => {
			"worklet";
			const current = tally.get();
			for (let i = 0; i < current.catches.length; i++) {
				if (current.catches[i].id > seen.get()) seen.set(current.catches[i].id);
			}
			const next = advanceTally(current, frame.timestamp);
			if (next !== current) tally.set(next);
			clock.set(frame.timestamp);
			if (tallyIdle(next, frame.timestamp)) scheduleOnRN(stopClock, seen.get());
		},
		[tally, seen, clock, stopClock],
	);
	const frameClock = useFrameCallback(onFrame, false);
	useEffect(() => {
		clockRef.current = frameClock;
	}, [frameClock]);

	// What the meter expects the score to be once every queued catch is in; a score below it
	// is a new run, which resets the meter
	const expectedRef = useRef(store.getState().frame.score);
	const addCatch = useCallback(
		(value: number, catchColor: string) => {
			expectedRef.current += value;
			const c = newCatch(ids.take(), value, catchColor);
			tally.modify((current) => {
				"worklet";
				return withCatch(current, c);
			});
			frameClock.setActive(true);
		},
		[ids, tally, frameClock],
	);

	// Each catch in its pay colour: the player's, or combo amber from the second step
	useEffect(
		() =>
			onGameEvents(store, (event, frame) => {
				if (event.type !== "collect" && event.type !== "collectPoint") return;
				const player = frame.dots.find((d) => d.kind === "player");
				addCatch(event.value, payColor(event.step, player?.color ?? WHITE));
			}),
		[store, addCatch],
	);

	const score = useStore(store, (s) => s.frame.score);
	useEffect(() => {
		if (score >= expectedRef.current) return;
		expectedRef.current = score;
		tally.set(createTally(score));
	}, [score, tally]);

	// Re-recorded only while something moves: the clock stands still otherwise
	const [recorder] = useState(() => Skia.PictureRecorder());
	const picture = useDerivedValue(() =>
		recordPicture(recorder, (canvas) =>
			drawTally(canvas, tally.get(), clock.get(), STYLE, geometry, scoreColor),
		),
	);

	return (
		<Canvas style={{ width, height: METER_HEIGHT }} pointerEvents="none">
			<Picture picture={picture} />
		</Canvas>
	);
};
