import { useCallback, useEffect, useState } from "react";
import {
	type FrameInfo,
	type SharedValue,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { CatchSoundOptions, GameAudio } from "../../application/ports";
import type { PourPlan, PourView } from "../effects/pourRun";
import { type PourFrame, type PourStatus, startPour, stepPour } from "../effects/pourScene";

/**
 * How a catch sounds in the pour: quieter than in play, and dropped rather than taking over a
 * busy player, as a flurry of take-overs stalls frames
 */
const POUR_SOUND: CatchSoundOptions = { volume: 0.4, skipWhenBusy: true };

/**
 * Plays a planned pour from the game over's mount, stepping it on the UI thread every frame
 * (see stepPour) against the best to beat `best` (see bestToBeat), and sounding each heard
 * landing quietly at its catch's pitch. The canvas draws `frame`; the interface reads `status`.
 * A frame's sounds and status change go to the JavaScript side together, at most once a frame.
 * The drop never finishes; it keeps rippling. Leaving the game over unmounts it, and the pour
 * stops with it. Never buzzes: a pour is a replay, not play.
 */
export function usePour(
	plan: PourPlan,
	audio: GameAudio,
	best: number,
): { frame: SharedValue<PourFrame>; status: PourStatus } {
	// Memoised by hand, as useStageEffects is: the React Compiler rebuilt the frame callback
	// every render, and useFrameCallback re-registers on each new one
	"use no memo";
	const [first] = useState(() => startPour(plan));
	const [status, setStatus] = useState(first.status);
	const playback = useSharedValue(first);
	const frame = useSharedValue(first.frame);
	// The verdict can land after the pour starts, so the frames read the best as it stands
	const bestToBeat = useSharedValue(best);
	useEffect(() => bestToBeat.set(best), [bestToBeat, best]);

	const report = useCallback(
		(sounds: PourView["sounds"], changed: PourStatus | null) => {
			for (const { point, pitch } of sounds) {
				if (point) audio.playLargeCollect(pitch, POUR_SOUND);
				else audio.playCollect(pitch, POUR_SOUND);
			}
			if (changed !== null) setStatus(changed);
		},
		[audio],
	);

	const onFrame = useCallback(
		(info: FrameInfo) => {
			"worklet";
			const step = stepPour(
				plan,
				playback.get(),
				info.timestamp,
				info.timeSincePreviousFrame ?? 0,
				bestToBeat.get(),
			);
			playback.set(step.playback);
			frame.set(step.playback.frame);
			if (step.sounds.length > 0 || step.status !== null) {
				scheduleOnRN(report, step.sounds, step.status);
			}
		},
		[plan, playback, frame, bestToBeat, report],
	);
	useFrameCallback(onFrame);

	return { frame, status };
}
