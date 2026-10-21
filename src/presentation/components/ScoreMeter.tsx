import { Canvas, Picture, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDerivedValue } from "react-native-reanimated";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import { onGameEvents } from "../../application/gameEvents";
import type { EffectReducer } from "../effects/effectLane";
import {
	advanceTally,
	createTally,
	newCatch,
	SCORE_PAD,
	SCORE_PITCH,
	type Tally,
	type TallyCatch,
	type TallyStyle,
	tallyIdle,
	withCatch,
} from "../effects/scoreTally";
import { useEffectLane } from "../hooks/useEffectLane";
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

/** The tally's lane: each catch made on the JS thread, then queued, stamped and counted in on the UI thread */
const TALLY: EffectReducer<Tally, TallyCatch> = {
	add: withCatch,
	advance: advanceTally,
	idle: tallyIdle,
};

/**
 * The score at the top of the stage, counting each catch in as it arrives (see scoreTally.ts).
 * Nothing here goes through React: each catch is added to the tally's effect lane (see
 * effectLane.ts), which stamps, ages and drops it on the UI thread each frame while anything
 * moves, and the picture is recorded there at the frame time. The clock runs only while
 * something moves.
 */
export const ScoreMeter: React.FC<ScoreMeterProps> = ({ store, color }) => {
	const { width } = useStageBox();
	const geometry = useMemo(() => ({ cx: width / 2, cy: SCORE_PAD + SCORE_PITCH * 3.5 }), [width]);
	const scoreColor = useMemo(() => Skia.Color(color), [color]);

	const {
		items: tally,
		time: clock,
		add,
	} = useEffectLane(TALLY, createTally(store.getState().frame.score));

	// What the meter expects the score to be once every queued catch is in; a score below it
	// is a new run, which resets the meter
	const expectedRef = useRef(store.getState().frame.score);

	// Each catch in its pay colour: the player's, or combo amber from the second step
	useEffect(
		() =>
			onGameEvents(store, (event, frame) => {
				if (event.type !== "collect" && event.type !== "collectPoint") return;
				const player = frame.dots.find((d) => d.kind === "player");
				const catchColor = payColor(event.step, player?.color ?? WHITE);
				expectedRef.current += event.value;
				add((id) => newCatch(id, event.value, catchColor));
			}),
		[store, add],
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
