import { BlurMask, Canvas, Circle, Group, RadialGradient, vec } from "@shopify/react-native-skia";
import type React from "react";
import { StyleSheet, View } from "react-native";
import {
	Easing,
	type SharedValue,
	useAnimatedReaction,
	useDerivedValue,
	useFrameCallback,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { type SettleState, settleEase } from "../tilt/settle";
import { useTilt } from "../tilt/TiltProvider";

interface SettleBowlProps {
	/** Diameter of the bowl rim */
	size: number;
	/** The dot's colour (the colour the player is about to play) */
	color: string;
	state: SharedValue<SettleState>;
	/** 0..1: how far the bowl is faded back while it can't be used yet; the dot never is */
	dim: SharedValue<number>;
}

/** Pixels the dot rolls per radian of raw tilt */
const GAIN = 110;
/** Fraction of the remaining distance closed per frame at 60 Hz */
const SMOOTHING = 0.25;
const PULSE_MS = 520;

/**
 * The bowl that levels itself to your hand. At first the dot rolls where gravity really is,
 * down to the low edge of a tilted phone. Hold still and the bowl tips to meet you: the dot
 * glides to the centre and a ring closes on it. Move and it rolls back out. When it comes to
 * rest the ring snaps and pulses, and that resting pose is level from now on.
 */
export const SettleBowl: React.FC<SettleBowlProps> = ({ size, color, state, dim }) => {
	const tilt = useTilt();
	const centre = size / 2;
	const rim = centre - 1;
	const dot = size * 0.085;
	const travel = rim - dot - 6;
	const closed = dot * 1.7;

	// Smoothed raw tilt so the dot rolls rather than steps at the sensor rate
	const shownX = useSharedValue(0);
	const shownY = useSharedValue(0);
	useFrameCallback((info) => {
		if (!tilt.available.get()) return;
		const dt = info.timeSincePreviousFrame ?? 16;
		const k = 1 - (1 - SMOOTHING) ** (dt / 16.67);
		const raw = tilt.raw.get();
		shownX.set(shownX.get() + (raw.x - shownX.get()) * k);
		shownY.set(shownY.get() + (raw.y - shownY.get()) * k);
	});

	// Snap and pulse once the pose has settled
	const pulse = useSharedValue(0);
	useAnimatedReaction(
		() => state.get().phase === "settled",
		(settled, was) => {
			if (settled && !was) {
				pulse.set(0);
				pulse.set(withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.cubic) }));
			}
		},
	);

	const level = useDerivedValue(() => settleEase(state.get().progress));
	const position = useDerivedValue(() => {
		// The bowl levels to the hand as the hold progresses: the mean is taken out gradually
		const s = state.get();
		let x = (shownX.get() - s.meanX * level.get()) * GAIN;
		let y = (shownY.get() - s.meanY * level.get()) * GAIN;
		const d = Math.hypot(x, y);
		if (d > travel) {
			x = (x / d) * travel;
			y = (y / d) * travel;
		}
		return vec(centre + x, centre + y);
	});
	const dotRadius = useDerivedValue(() => dot * (1 + 0.3 * Math.sin(pulse.get() * Math.PI)));
	const glowRadius = useDerivedValue(() => dotRadius.get() * (1.5 + level.get() * 0.4));
	const glowOpacity = useDerivedValue(() => 0.35 + level.get() * 0.45);
	const ringRadius = useDerivedValue(() => rim - (rim - closed) * level.get());
	const ringOpacity = useDerivedValue(() => 0.12 + level.get() * 0.88);
	const pulseRadius = useDerivedValue(() => closed + (rim * 1.1 - closed) * pulse.get());
	const pulseOpacity = useDerivedValue(() =>
		pulse.get() > 0 && pulse.get() < 1 ? 0.9 * (1 - pulse.get()) : 0,
	);
	const bowlOpacity = useDerivedValue(() => 1 - dim.get());

	return (
		<View style={{ width: size, height: size }} pointerEvents="none">
			<Canvas style={StyleSheet.absoluteFill}>
				<Group opacity={bowlOpacity}>
					<Circle cx={centre} cy={centre} r={rim}>
						<RadialGradient
							c={vec(centre, centre)}
							r={rim}
							colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.02)", "rgba(255,255,255,0.09)"]}
							positions={[0.3, 0.8, 1]}
						/>
					</Circle>
					<Circle
						cx={centre}
						cy={centre}
						r={rim}
						color="rgba(255,255,255,0.14)"
						style="stroke"
						strokeWidth={1.5}
					/>
					<Circle cx={centre} cy={centre} r={rim * 0.03} color="rgba(255,255,255,0.35)" />
					<Circle
						cx={centre}
						cy={centre}
						r={ringRadius}
						color={color}
						opacity={ringOpacity}
						style="stroke"
						strokeWidth={2.5}
					/>
					<Circle
						cx={centre}
						cy={centre}
						r={pulseRadius}
						color={color}
						opacity={pulseOpacity}
						style="stroke"
						strokeWidth={3}
					/>
				</Group>
				<Group opacity={glowOpacity}>
					<Circle c={position} r={glowRadius} color={color}>
						<BlurMask blur={dot * 0.6} style="normal" />
					</Circle>
				</Group>
				<Circle c={position} r={dotRadius} color={color} />
			</Canvas>
		</View>
	);
};
