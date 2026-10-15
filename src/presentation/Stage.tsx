import type React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import type { ScreenSize } from "../domain/types";
import { type Burst, Bursts } from "./effects/Bursts";
import { GameCanvas } from "./GameCanvas";

interface StageProps {
	scene: SharedValue<Float32Array>;
	frost: SharedValue<number>;
	accent: SharedValue<string>;
	/** How much of the stage shows over the room, 0..1 */
	stageOpacity: SharedValue<number>;
	/** Sideways shake (px) for the final hit */
	shake: SharedValue<number>;
	bursts: Burst[];
	onLayout: (size: ScreenSize) => void;
	onDragDelta?: (dx: number, dy: number) => void;
}

/**
 * The playfield: the game canvas, and the score bursts over it. The canvas fades and shakes
 * the scene itself (see GameCanvas); the bursts fade and shake with it as views.
 */
export const Stage: React.FC<StageProps> = ({
	scene,
	frost,
	accent,
	stageOpacity,
	shake,
	bursts,
	onLayout,
	onDragDelta,
}) => {
	const fadeStyle = useAnimatedStyle(() => ({ opacity: stageOpacity.get() }));
	const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
	return (
		<>
			<View style={StyleSheet.absoluteFill}>
				<GameCanvas
					scene={scene}
					frost={frost}
					accent={accent}
					stageOpacity={stageOpacity}
					shake={shake}
					onLayout={onLayout}
					onDragDelta={onDragDelta}
				/>
			</View>
			<Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents="none">
				<Animated.View style={[styles.fill, shakeStyle]}>
					<Bursts bursts={bursts} />
				</Animated.View>
			</Animated.View>
		</>
	);
};

const styles = StyleSheet.create({
	fill: { flex: 1 },
});
