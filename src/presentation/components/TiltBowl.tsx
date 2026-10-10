import { Canvas, Circle, Group, RadialGradient, vec } from "@shopify/react-native-skia";
import type React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue } from "react-native-reanimated";
import { useTilt } from "../tilt/TiltProvider";

interface TiltBowlProps {
	/** Diameter of the bowl rim */
	size: number;
	/** Diameter of the dot that rolls inside (the child) */
	dotSize: number;
	children: React.ReactNode;
}

/** Pixels the dot rolls per radian of tilt */
const ROLL_GAIN = 150;

/**
 * A shallow bowl: whatever sits inside rolls with the device tilt, the same way the player
 * dot moves in the game, so the title screen quietly teaches the controls before play.
 */
export const TiltBowl: React.FC<TiltBowlProps> = ({ size, dotSize, children }) => {
	const tilt = useTilt();
	const rim = size / 2;
	const travel = rim - dotSize / 2 - 6;

	const offset = useDerivedValue(() => {
		let x = tilt.x.value * ROLL_GAIN;
		let y = tilt.y.value * ROLL_GAIN;
		const d = Math.hypot(x, y);
		if (d > travel) {
			x = (x / d) * travel;
			y = (y / d) * travel;
		}
		return { x, y };
	});

	const dotStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: offset.value.x }, { translateY: offset.value.y }],
	}));

	// Contact shadow: lags under the dot and stretches toward the rim as it rolls out
	const shadowCentre = useDerivedValue(() =>
		vec(rim + offset.value.x * 1.08, rim + offset.value.y * 1.08 + 6),
	);
	const shadowRadius = useDerivedValue(
		() => dotSize * 0.55 + Math.hypot(offset.value.x, offset.value.y) * 0.08,
	);

	return (
		<View style={{ width: size, height: size }}>
			<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
				<Circle cx={rim} cy={rim} r={rim}>
					<RadialGradient
						c={vec(rim, rim)}
						r={rim}
						colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.02)", "rgba(255,255,255,0.09)"]}
						positions={[0.3, 0.8, 1]}
					/>
				</Circle>
				<Circle
					cx={rim}
					cy={rim}
					r={rim - 1}
					color="rgba(255,255,255,0.14)"
					style="stroke"
					strokeWidth={1.5}
				/>
				<Group opacity={0.55}>
					<Circle cx={rim} cy={rim} r={rim * 0.03} color="rgba(255,255,255,0.35)" />
				</Group>
				<Circle c={shadowCentre} r={shadowRadius}>
					<RadialGradient
						c={shadowCentre}
						r={shadowRadius}
						colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
					/>
				</Circle>
			</Canvas>
			<Animated.View style={[styles.dot, dotStyle]}>{children}</Animated.View>
		</View>
	);
};

const styles = StyleSheet.create({
	dot: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
	},
});
