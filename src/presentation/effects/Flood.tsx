import type React from "react";
import { useCallback, useMemo } from "react";
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
 */
export function useFlood(): FloodController {
	const progress = useSharedValue(0);
	const opacity = useSharedValue(0);
	const color = useSharedValue("#FFFFFF");
	const originX = useSharedValue(0);
	const originY = useSharedValue(0);

	const run = useCallback(
		(nextColor: string, x: number, y: number, onCovered: () => void) => {
			color.set(nextColor);
			originX.set(x);
			originY.set(y);
			opacity.set(1);
			progress.set(0);
			progress.set(
				withTiming(1, { duration: COVER_MS, easing: Easing.in(Easing.quad) }, (finished) => {
					if (!finished) return;
					scheduleOnRN(onCovered);
					opacity.set(
						withDelay(
							60,
							withTiming(0, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }, (done) => {
								if (done) progress.set(0);
							}),
						),
					);
				}),
			);
		},
		[color, originX, originY, opacity, progress],
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
