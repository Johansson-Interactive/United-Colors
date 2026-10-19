import { useCallback, useState } from "react";
import {
	type FrameInfo,
	type SharedValue,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
	JELLY_AT_REST,
	type JellyState,
	jellyShape,
	kickJelly,
	stepJelly,
} from "../../application/jelly";
import type { GameAudio } from "../../application/ports";
import { advanceBursts, type Burst, layOutBurst, withBurst } from "../effects/burstFrames";
import { type PourPlan, type PourView, pourAt } from "../effects/pourRun";
import { easeToward, landingKick } from "../effects/pourScene";
import { COMBO_AMBER } from "../theme/theme";

/** The pour's clock starts this long after the game over mounts (ms), as it fades in */
export const POUR_DELAY_MS = 350;
/** How loud a catch sounds in the pour, against in play */
const POUR_VOLUME = 0.4;
/** A combo catch's amber ring, from the drop's centre: its diameter before it grows (px) */
const COMBO_RING_SIZE = 40;
/** Longest frame (ms) the drop's liquid integrates, so a stall does not kick it */
const MAX_FRAME_MS = 100;

/** One frame of the pour as the canvas draws it, from the drop's centre */
export interface PourFrame {
	view: PourView;
	/** The drop's radius and the amber share, eased after the stepper's */
	radius: number;
	amber: number;
	jelly: JellyState;
	/** The combo catches' amber rings, at frame time `now` (see burstFrames.ts) */
	bursts: Burst[];
	now: number;
}

/** What the game over's interface shows of the pour; it changes only now and then */
export interface PourStatus {
	clock: string;
	bestShown: boolean;
	settled: boolean;
}

function statusOf(view: PourView): PourStatus {
	"worklet";
	return { clock: view.clock, bestShown: view.bestShown, settled: view.settled };
}

/**
 * Plays a planned pour from the game over's mount, sampling the stepper on the UI thread every
 * frame (see pourRun.ts): each landing kicks the drop's liquid, rings amber for a combo and
 * sounds quietly at its catch's pitch. The canvas draws `frame`; the interface reads `status`.
 * Leaving the game over unmounts it, and the pour stops with it. Never buzzes: a pour is a
 * recap, not play.
 */
export function usePour(
	plan: PourPlan,
	audio: GameAudio,
): { frame: SharedValue<PourFrame>; status: PourStatus } {
	// Memoised by hand, as useStageEffects is: the React Compiler rebuilt the frame callback
	// every render, and useFrameCallback re-registers on each new one
	"use no memo";
	const [ring] = useState(() =>
		layOutBurst(0, { kind: "ring", x: 0, y: 0, color: COMBO_AMBER, size: COMBO_RING_SIZE }),
	);
	const [initial] = useState(() => pourAt(plan, -POUR_DELAY_MS));
	const [status, setStatus] = useState(() => statusOf(initial));
	const frame = useSharedValue<PourFrame>({
		view: initial,
		radius: 0,
		amber: 0,
		jelly: { stretchX: 0, stretchY: 0, wobble: 0 },
		bursts: [],
		now: 0,
	});
	const start = useSharedValue(-1);
	const sampled = useSharedValue(-POUR_DELAY_MS);
	const body = useSharedValue(JELLY_AT_REST);
	const shown = useSharedValue(statusOf(initial));

	const sound = useCallback(
		(landings: PourView["landings"]) => {
			for (const { point, pitch } of landings) {
				if (point) audio.playLargeCollect(pitch, POUR_VOLUME);
				else audio.playCollect(pitch, POUR_VOLUME);
			}
		},
		[audio],
	);

	const onFrame = useCallback(
		(info: FrameInfo) => {
			"worklet";
			if (start.get() < 0) start.set(info.timestamp);
			const ms = info.timestamp - start.get() - POUR_DELAY_MS;
			const dt = Math.min(MAX_FRAME_MS, info.timeSincePreviousFrame ?? 0);
			const view = pourAt(plan, ms, sampled.get());
			sampled.set(ms);
			const before = frame.get();
			let jelly = body.get();
			let bursts = before.bursts;
			for (const landing of view.landings) {
				jelly = kickJelly(jelly, 0, landingKick(view.drop.radius, landing.point));
				if (landing.combo) bursts = withBurst(bursts, ring);
			}
			jelly = stepJelly(jelly, 0, 0, view.drop.radius, dt);
			body.set(jelly);
			frame.set({
				view,
				radius: easeToward(before.radius, view.drop.radius, dt),
				amber: easeToward(before.amber, view.amber, dt),
				jelly: jellyShape(jelly, view.drop.radius),
				bursts: advanceBursts(bursts, info.timestamp),
				now: info.timestamp,
			});
			if (view.landings.length > 0) scheduleOnRN(sound, view.landings);
			const was = shown.get();
			if (
				view.clock !== was.clock ||
				view.bestShown !== was.bestShown ||
				view.settled !== was.settled
			) {
				const next = statusOf(view);
				shown.set(next);
				scheduleOnRN(setStatus, next);
			}
		},
		[plan, ring, start, sampled, frame, body, shown, sound],
	);
	useFrameCallback(onFrame);

	return { frame, status };
}
