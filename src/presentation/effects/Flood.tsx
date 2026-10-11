import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
	Easing,
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { createFloodSequence } from "./floodSequence";

const BASE_DIAMETER = 100;
const COVER_MS = 420;
const REVEAL_MS = 460;

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
 * The lift waits for React to commit the changed scene, so a slow mount (the title screen)
 * never shows the old screen fading out from under a dot that has already gone.
 */
export function useFlood(): FloodController {
	const progress = useSharedValue(0);
	const opacity = useSharedValue(0);
	const color = useSharedValue("#FFFFFF");
	const originX = useSharedValue(0);
	const originY = useSharedValue(0);
	// Bumped when the dot covers the screen, in the same task as the scene change, so the
	// effect below runs after the new scene has been committed
	const [coveredTick, setCoveredTick] = useState(0);

	const [sequence] = useState(() => {
		const covered = () => {
			setCoveredTick((tick) => tick + 1);
			created.covered();
		};
		const lifted = () => created.lifted();
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
				opacity.set(
					withDelay(
						60,
						withTiming(0, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }, (done) => {
							if (!done) return;
							progress.set(0);
							scheduleOnRN(lifted);
						}),
					),
				);
			},
		});
		return created;
	});

	// After the commit that followed the cover: the scene under the dot is the new one
	useEffect(() => {
		if (coveredTick > 0) sequence.sceneRendered();
	}, [coveredTick, sequence]);

	const run = useCallback(
		(nextColor: string, x: number, y: number, onCoveredFn: () => void) => {
			color.set(nextColor);
			originX.set(x);
			originY.set(y);
			sequence.run(onCoveredFn);
		},
		[color, originX, originY, sequence],
	);

	return useMemo(
		() => ({ progress, opacity, color, originX, originY, run }),
		[progress, opacity, color, originX, originY, run],
	);
}

export const FloodOverlay: React.FC<{ flood: FloodController }> = ({ flood }) => {
	const { width, height } = useWindowDimensions();
	const style = useAnimatedStyle(() => {
		const ox = flood.originX.get();
		const oy = flood.originY.get();
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
