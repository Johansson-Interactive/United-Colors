import type React from "react";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { DotMatrixText } from "../components/DotMatrixText";

export type Burst =
	| { id: number; kind: "pop"; x: number; y: number; text: string; color: string }
	| { id: number; kind: "ring"; x: number; y: number; color: string; size?: number };

/** A burst before it is given an id (distributive so each kind keeps its own fields) */
export type BurstInput = Burst extends infer B ? (B extends Burst ? Omit<B, "id"> : never) : never;

export const BURST_LIFETIME_MS = 900;
const POP_WIDTH = 120;

/**
 * Short-lived feedback drawn at a point in the playfield: a score pop that floats up, or
 * a ring that expands from where something happened (a colour switch, the final hit).
 */
export const Bursts: React.FC<{ bursts: Burst[] }> = ({ bursts }) => (
	<View style={StyleSheet.absoluteFill} pointerEvents="none">
		{bursts.map((b) =>
			b.kind === "pop" ? <Pop key={b.id} burst={b} /> : <Ring key={b.id} burst={b} />,
		)}
	</View>
);

const Pop: React.FC<{ burst: Extract<Burst, { kind: "pop" }> }> = ({ burst }) => {
	const t = useSharedValue(0);
	useEffect(() => {
		t.set(withTiming(1, { duration: BURST_LIFETIME_MS, easing: Easing.out(Easing.cubic) }));
	}, [t]);
	const style = useAnimatedStyle(() => ({
		opacity: t.get() < 0.6 ? 1 : 1 - (t.get() - 0.6) / 0.4,
		transform: [
			{ translateX: burst.x - POP_WIDTH / 2 },
			{ translateY: burst.y - 30 - t.get() * 46 },
			{ scale: 0.7 + Math.min(t.get() * 4, 1) * 0.5 },
		],
	}));
	return (
		<Animated.View style={[styles.pop, style]}>
			<DotMatrixText text={burst.text} pitch={5} color={burst.color} glow />
		</Animated.View>
	);
};

const Ring: React.FC<{ burst: Extract<Burst, { kind: "ring" }> }> = ({ burst }) => {
	const t = useSharedValue(0);
	const size = burst.size ?? 60;
	useEffect(() => {
		t.set(
			withDelay(0, withTiming(1, { duration: BURST_LIFETIME_MS, easing: Easing.out(Easing.quad) })),
		);
	}, [t]);
	const style = useAnimatedStyle(() => ({
		opacity: (1 - t.get()) * 0.9,
		borderColor: burst.color,
		borderWidth: 3 + (1 - t.get()) * 5,
		transform: [
			{ translateX: burst.x - size / 2 },
			{ translateY: burst.y - size / 2 },
			{ scale: 0.3 + t.get() * 9 },
		],
	}));
	return (
		<Animated.View
			style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, style]}
		/>
	);
};

const styles = StyleSheet.create({
	pop: {
		position: "absolute",
		left: 0,
		top: 0,
		width: POP_WIDTH,
		alignItems: "center",
	},
	ring: {
		position: "absolute",
		left: 0,
		top: 0,
	},
});
