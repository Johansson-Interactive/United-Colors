import { useCallback, useEffect } from "react";
import { type SharedValue, useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { GameStore } from "../../application/GameStore";
import type { ScreenSize } from "../../domain/types";
import {
	createTally,
	placeTotal,
	resetTally,
	sliversInAir,
	TALLY,
	type Tally,
	UNPLACED,
	withGeometry,
} from "../effects/scoreTally";
import { feedTally } from "../effects/tallyFeed";
import { useEffectLane } from "./useEffectLane";

/** The score meter's tally as the screens share it: drawn by the HUD, read by the paused score */
export interface ScoreTally {
	/** The tally, on the UI thread */
	tally: SharedValue<Tally>;
	/** The tally lane's time at its latest frame, which the tally is drawn at */
	clock: SharedValue<number>;
	/** Stand the total on a stage of `size`, as the stage is laid out */
	place: (size: ScreenSize) => void;
}

/**
 * The score meter's tally (see scoreTally.ts) in its effect lane, fed from the store each
 * frame (see tallyFeed.ts): its catches, its freezes with the run and its fresh starts. Reads
 * the store; never writes to it. Whether score slivers are in the air goes to
 * `onSliversInAir` as it changes, so the game over can wait for the last of them.
 */
export function useScoreTally(
	store: GameStore,
	onSliversInAir: (inAir: boolean) => void,
): ScoreTally {
	const {
		state: tally,
		time: clock,
		add,
		setFrozen,
	} = useEffectLane(TALLY, createTally(store.getState().frame.score, UNPLACED));

	useEffect(
		() =>
			store.subscribe(({ frame }, previous) => {
				if (frame === previous.frame) return;
				const { reset, catches, freeze } = feedTally(previous.frame, frame);
				if (reset !== null) {
					tally.modify((current) => {
						"worklet";
						return resetTally(current, reset);
					});
				}
				for (const c of catches) add(() => c);
				if (freeze !== null) setFrozen(freeze);
			}),
		[store, tally, add, setFrozen],
	);

	useAnimatedReaction(
		() => sliversInAir(tally.get()),
		(inAir, previous) => {
			if (inAir !== previous) scheduleOnRN(onSliversInAir, inAir);
		},
	);

	const place = useCallback(
		({ width, height }: ScreenSize) => {
			const geometry = placeTotal(width, height);
			tally.modify((current) => {
				"worklet";
				return withGeometry(current, geometry);
			});
		},
		[tally],
	);

	return { tally, clock, place };
}
