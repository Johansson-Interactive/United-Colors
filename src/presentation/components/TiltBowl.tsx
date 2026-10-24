import { Canvas, Circle, Group, RadialGradient, vec } from "@shopify/react-native-skia";
import type React from "react";
import { createContext, use } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { BOWL_GLAZE, BOWL_GLAZE_STOPS, BOWL_MARK, BOWL_RIM, shade } from "../theme/theme";
import { leanTowards } from "../tilt/lean";
import { useTilt } from "../tilt/TiltProvider";

/** The dot's shadow on the bowl, dark under it and fading out */
const SHADOW = [shade(0.55), shade(0)];

interface TiltBowlProps {
	/** Diameter of the bowl rim */
	size: number;
	/** Diameter of the dot that rolls inside (the child) */
	dotSize: number;
	/** The dot rolls this many times its usual distance per tilt, like the player dot */
	sensitivity?: number;
	children: React.ReactNode;
}

interface BowlOffset {
	x: number;
	y: number;
}

const BowlOffsetContext = createContext<SharedValue<BowlOffset> | null>(null);

/** How far the dot in the enclosing bowl has rolled from the centre (px); null outside a bowl */
export function useBowlOffset(): SharedValue<BowlOffset> | null {
	return use(BowlOffsetContext);
}

/** Pixels the dot rolls per radian of tilt at the default sensitivity */
const ROLL_GAIN = 150;

/**
 * A shallow bowl: whatever sits inside rolls with the device tilt, the same way the player
 * dot moves in the game, so the title screen quietly teaches the controls before play. It leans
 * to match the hand (see lean.ts): the dot rolls as the grip changes and glides home once it is
 * steady, in any grip, before any level pose is taken.
 */
export const TiltBowl: React.FC<TiltBowlProps> = ({ size, dotSize, sensitivity = 1, children }) => {
	const tilt = useTilt();
	const gain = ROLL_GAIN * sensitivity;
	const rim = size / 2;
	const travel = rim - dotSize / 2 - 6;

	// The bowl's "down", as a tilt; it starts where the tilt is, so the dot starts at rest
	const leanX = useSharedValue(tilt.x.get());
	const leanY = useSharedValue(tilt.y.get());
	useFrameCallback((info) => {
		const dt = info.timeSincePreviousFrame ?? 16;
		leanX.set(leanTowards(leanX.get(), tilt.x.get(), dt));
		leanY.set(leanTowards(leanY.get(), tilt.y.get(), dt));
	});

	const offset = useDerivedValue((): BowlOffset => {
		let x = (tilt.x.get() - leanX.get()) * gain;
		let y = (tilt.y.get() - leanY.get()) * gain;
		const d = Math.hypot(x, y);
		if (d > travel) {
			x = (x / d) * travel;
			y = (y / d) * travel;
		}
		return { x, y };
	});

	const dotStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: offset.get().x }, { translateY: offset.get().y }],
	}));

	// Contact shadow: lags under the dot and stretches toward the rim as it rolls out
	const shadowCentre = useDerivedValue(() =>
		vec(rim + offset.get().x * 1.08, rim + offset.get().y * 1.08 + 6),
	);
	const shadowRadius = useDerivedValue(
		() => dotSize * 0.55 + Math.hypot(offset.get().x, offset.get().y) * 0.08,
	);

	return (
		<View style={{ width: size, height: size }}>
			<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
				<Circle cx={rim} cy={rim} r={rim}>
					<RadialGradient
						c={vec(rim, rim)}
						r={rim}
						colors={BOWL_GLAZE}
						positions={BOWL_GLAZE_STOPS}
					/>
				</Circle>
				<Circle cx={rim} cy={rim} r={rim - 1} color={BOWL_RIM} style="stroke" strokeWidth={1.5} />
				<Group opacity={0.55}>
					<Circle cx={rim} cy={rim} r={rim * 0.03} color={BOWL_MARK} />
				</Group>
				<Circle c={shadowCentre} r={shadowRadius}>
					<RadialGradient c={shadowCentre} r={shadowRadius} colors={SHADOW} />
				</Circle>
			</Canvas>
			<Animated.View style={[styles.dot, dotStyle]}>
				<BowlOffsetContext value={offset}>{children}</BowlOffsetContext>
			</Animated.View>
		</View>
	);
};

const styles = StyleSheet.create({
	dot: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
	},
});
