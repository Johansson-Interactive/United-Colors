import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, {
	Easing,
	type SharedValue,
	useAnimatedStyle,
	useFrameCallback,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useStageBox } from "../layout/StageFrame";
import { createFloodSequence, tallySmoothFrames } from "./floodSequence";

const BASE_DIAMETER = 100;
const COVER_MS = 420;
const REVEAL_MS = 460;
const REVEAL_DELAY_MS = 60;
/** Steady frames the new scene must draw before the lift; a longer frame is a stall */
const SMOOTH_FRAMES = 3;
const SMOOTH_FRAME_MS = 34;

export interface FloodController {
	progress: SharedValue<number>;
	opacity: SharedValue<number>;
	color: SharedValue<string>;
	originX: SharedValue<number>;
	originY: SharedValue<number>;
	/** Grow a dot of `color` from (x, y) until it covers the screen, run `onCovered`, then lift it */
	run: (color: string, x: number, y: number, onCovered: () => void) => void;
}

/**
 * Screen transitions are a dot swallowing the screen: tap a dot and it grows from under
 * your finger until everything is its colour, the scene changes underneath, and it lifts.
 * The lift waits for React to commit the changed scene and then for the UI thread to draw
 * it at a steady rate: a slow mount or first draw (the title screen) would otherwise push a
 * timed lift to its end, showing the old screen fading out from under a dot already gone.
 */
export function useFlood(): FloodController {
	const progress = useSharedValue(0);
	const opacity = useSharedValue(0);
	const color = useSharedValue("#FFFFFF");
	const originX = useSharedValue(0);
	const originY = useSharedValue(0);
	// True from the scene commit until the lift starts; the frame gate below watches for it
	const awaitingSmoothFrames = useSharedValue(false);
	const smoothFrames = useSharedValue(0);
	// Bumped when the dot covers the screen (in the same task as the scene change, so the
	// effect below runs after the new scene has been committed) and again when it has lifted
	const [tick, setTick] = useState(0);

	const [sequence] = useState(() => {
		const covered = () => {
			setTick((t) => t + 1);
			created.covered();
		};
		const created = createFloodSequence({
			cover: () => {
				opacity.set(1);
				progress.set(0);
				progress.set(
					withTiming(1, { duration: COVER_MS, easing: Easing.in(Easing.quad) }, (finished) => {
						if (finished) scheduleOnRN(covered);
					}),
				);
			},
			lift: () => {
				smoothFrames.set(0);
				awaitingSmoothFrames.set(true);
			},
		});
		return created;
	});

	const lifted = useCallback(() => {
		sequence.lifted();
		setTick((t) => t + 1);
	}, [sequence]);

	// Lets the lift begin only once the new scene has drawn a few frames without a stall
	const gate = useFrameCallback((frame) => {
		if (!awaitingSmoothFrames.get()) return;
		smoothFrames.set(
			tallySmoothFrames(smoothFrames.get(), frame.timeSincePreviousFrame ?? 0, SMOOTH_FRAME_MS),
		);
		if (smoothFrames.get() < SMOOTH_FRAMES) return;
		awaitingSmoothFrames.set(false);
		opacity.set(
			withDelay(
				REVEAL_DELAY_MS,
				withTiming(0, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }, (done) => {
					if (!done) return;
					progress.set(0);
					scheduleOnRN(lifted);
				}),
			),
		);
	}, false);

	// After the commit that followed the cover, the scene under the dot is the new one: arm the
	// gate. After the lift, disarm it.
	useEffect(() => {
		if (tick === 0) return;
		sequence.sceneRendered();
		gate.setActive(sequence.stage === "lifting");
	}, [tick, sequence, gate]);

	const run = useCallback(
		(nextColor: string, x: number, y: number, onCovered: () => void) => {
			color.set(nextColor);
			originX.set(x);
			originY.set(y);
			sequence.run(onCovered);
		},
		[color, originX, originY, sequence],
	);

	return useMemo(
		() => ({ progress, opacity, color, originX, originY, run }),
		[progress, opacity, color, originX, originY, run],
	);
}

export const FloodOverlay: React.FC<{ flood: FloodController }> = ({ flood }) => {
	const { width, height, left, top } = useStageBox();
	const style = useAnimatedStyle(() => {
		// The origin is a press's window position; the flood fills the game's box
		const ox = flood.originX.get() - left;
		const oy = flood.originY.get() - top;
		// Radius needed to reach the farthest corner from the origin
		const reach = Math.hypot(Math.max(ox, width - ox), Math.max(oy, height - oy));
		const scale = (flood.progress.get() * reach * 2.05) / BASE_DIAMETER;
		return {
			opacity: flood.opacity.get(),
			backgroundColor: flood.color.get(),
			transform: [
				{ translateX: ox - BASE_DIAMETER / 2 },
				{ translateY: oy - BASE_DIAMETER / 2 },
				{ scale: Math.max(scale, 0.0001) },
			],
		};
	});
	const pointerStyle = useAnimatedStyle(() => ({
		pointerEvents: flood.opacity.get() > 0 ? "auto" : "none",
	}));

	return (
		<Animated.View style={[StyleSheet.absoluteFill, pointerStyle]}>
			<Animated.View style={[styles.dot, style]} />
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	dot: {
		position: "absolute",
		left: 0,
		top: 0,
		width: BASE_DIAMETER,
		height: BASE_DIAMETER,
		borderRadius: BASE_DIAMETER / 2,
	},
});
