import { Canvas, Picture, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { type SharedValue, useAnimatedReaction, useDerivedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { GameStore } from "../../application/GameStore";
import { onGameEvents } from "../../application/gameEvents";
import { NOT_STARTED } from "../effects/burstFrames";
import {
	createTally,
	freezeTally,
	newCatch,
	resetTally,
	SCORE_CENTRE_Y,
	shownScore,
	sliverSpeed,
	sliversInAir,
	TALLY,
} from "../effects/scoreTally";
import { useEffectLane } from "../hooks/useEffectLane";
import { useStageBox } from "../layout/StageFrame";
import { recordPicture } from "../recordPicture";
import { drawTally } from "../sceneDrawer";
import { payColor, WHITE } from "../theme/theme";

interface ScoreMeterProps {
	/** The score and its catches are read here, so a catch re-renders nothing */
	store: GameStore;
	/**
	 * The player's current colour, followed on the UI thread; the total wears it so a switch is
	 * always visible
	 */
	color: SharedValue<string>;
	/** Whether the total shows: in play, and while the game over waits for its slivers */
	visible: boolean;
	/** Score slivers came into the air, or the last of them arrived */
	onSliversInAir: (inAir: boolean) => void;
	/** The score as it stood when the run froze, every sliver landed by then (null once it runs) */
	onFrozenScore: (score: number | null) => void;
}

/**
 * The score at the top of the stage, and the score slivers flying into it across the field
 * (see scoreTally.ts), on a canvas the size of the stage. It stays mounted while a run pauses,
 * so slivers frozen in the air fly on as play resumes; it only hides off play. Nothing here
 * goes through React: each catch is added to the tally's effect lane (see effectLane.ts),
 * which stamps, ages and drops it on the UI thread each frame while anything moves, and the
 * picture is recorded there at the frame time. The clock runs only while something moves.
 */
export const ScoreMeter: React.FC<ScoreMeterProps> = ({
	store,
	color,
	visible,
	onSliversInAir,
	onFrozenScore,
}) => {
	const { width, height } = useStageBox();
	const geometry = useMemo(
		() => ({
			cx: width / 2,
			cy: SCORE_CENTRE_Y,
			speed: sliverSpeed(width, height, SCORE_CENTRE_Y),
		}),
		[width, height],
	);
	// Parsed only when the colour changes, not with the tally every frame
	const scoreColor = useDerivedValue(() => Skia.Color(color.get()));

	const {
		state: tally,
		time: clock,
		add,
	} = useEffectLane(TALLY, createTally(store.getState().frame.score));

	// Read by the catch listener, which outlives a change of stage size
	const geometryRef = useRef(geometry);
	useEffect(() => {
		geometryRef.current = geometry;
	}, [geometry]);

	// Each catch of a run, from where the player took it in, in its pay colour: the player's,
	// or combo amber from the second step
	useEffect(
		() =>
			onGameEvents(store, (event, frame) => {
				if (event.type !== "collect" && event.type !== "collectPoint") return;
				if (frame.phase !== "RUNNING" && frame.phase !== "REJECTING") return;
				const player = frame.dots.find((d) => d.kind === "player");
				if (!player) return;
				const catchColor = payColor(event.step, player.color ?? WHITE);
				add((id) =>
					newCatch(
						id,
						event.value,
						catchColor,
						player.x,
						player.y,
						frame.score,
						geometryRef.current,
					),
				);
			}),
		[store, add],
	);

	// The tally freezes with the run, and starts over with a new run (its score below the last
	// seen) or with none; followed outside React, so a catch renders nothing here
	useEffect(() => {
		let { phase, score } = store.getState().frame;
		return store.subscribe(({ frame }) => {
			if (frame.phase !== phase && (frame.phase === "PAUSED" || phase === "PAUSED")) {
				add(() => freezeTally(frame.phase === "PAUSED"));
			}
			if (frame.score < score || (frame.phase === "KIOSK" && phase !== "KIOSK")) {
				add(() => resetTally(frame.score));
			}
			phase = frame.phase;
			score = frame.score;
		});
	}, [store, add]);

	// What the screens ask of the tally, sent across only when it changes
	useAnimatedReaction(
		() => sliversInAir(tally.get()),
		(inAir, previous) => {
			if (inAir !== previous) scheduleOnRN(onSliversInAir, inAir);
		},
	);
	useAnimatedReaction(
		() => {
			const current = tally.get();
			return current.frozenAt === NOT_STARTED ? -1 : shownScore(current, current.frozenAt);
		},
		(frozen, previous) => {
			if (frozen !== previous) scheduleOnRN(onFrozenScore, frozen < 0 ? null : frozen);
		},
	);

	// Re-recorded only while something moves: the clock stands still otherwise
	const [recorder] = useState(() => Skia.PictureRecorder());
	const picture = useDerivedValue(() =>
		recordPicture(recorder, (canvas) =>
			drawTally(canvas, tally.get(), clock.get(), geometry, scoreColor.get()),
		),
	);

	return (
		<View style={[StyleSheet.absoluteFill, !visible && styles.hidden]} pointerEvents="none">
			<Canvas style={{ width, height }}>
				<Picture picture={picture} />
			</Canvas>
		</View>
	);
};

const styles = StyleSheet.create({
	hidden: {
		opacity: 0,
	},
});
