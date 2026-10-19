import { useCallback, useState } from "react";
import {
	type FrameInfo,
	type SharedValue,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { GameAudio } from "../../application/ports";
import type { PourPlan, PourView } from "../effects/pourRun";
import { type PourFrame, type PourStatus, startPour, stepPour } from "../effects/pourScene";

/** How loud a catch sounds in the pour, against in play */
const POUR_VOLUME = 0.4;

/**
 * Plays a planned pour from the game over's mount, stepping it on the UI thread every frame
 * (see stepPour) and sounding each heard landing quietly at its catch's pitch. The canvas draws
 * `frame`; the interface reads `status`. Once the pour is done, the frames do nothing more.
 * Leaving the game over unmounts it, and the pour stops with it. Never buzzes: a pour is a
 * replay, not play.
 */
export function usePour(
	plan: PourPlan,
	audio: GameAudio,
): { frame: SharedValue<PourFrame>; status: PourStatus } {
	// Memoised by hand, as useStageEffects is: the React Compiler rebuilt the frame callback
	// every render, and useFrameCallback re-registers on each new one
	"use no memo";
	const [first] = useState(() => startPour(plan));
	const [status, setStatus] = useState(first.status);
	const playback = useSharedValue(first);
	const frame = useSharedValue(first.frame);

	const sound = useCallback(
		(sounds: PourView["sounds"]) => {
			for (const { point, pitch } of sounds) {
				if (point) audio.playLargeCollect(pitch, POUR_VOLUME);
				else audio.playCollect(pitch, POUR_VOLUME);
			}
		},
		[audio],
	);

	const onFrame = useCallback(
		(info: FrameInfo) => {
			"worklet";
			const step = stepPour(plan, playback.get(), info.timestamp, info.timeSincePreviousFrame ?? 0);
			if (step === null) return;
			playback.set(step.playback);
			frame.set(step.playback.frame);
			if (step.sounds.length > 0) scheduleOnRN(sound, step.sounds);
			if (step.status !== null) scheduleOnRN(setStatus, step.status);
		},
		[plan, playback, frame, sound],
	);
	useFrameCallback(onFrame);

	return { frame, status };
}
