import type React from "react";
import { useCallback } from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { FIELD_TOUCH_FRAME, type FieldTouchState } from "../touch/fieldTouch";

interface FieldTouchProps {
	/** Written as the finger lands and lifts, for the steppers on the UI thread to read each frame */
	touch: SharedValue<FieldTouchState>;
	/** A finger landed on the field; the flow decides what that does */
	onTouch: () => void;
	/** Off, the layer lets every touch through (dev: the field steers the dot by drag) */
	enabled: boolean;
}

/**
 * The field as a touch surface (see GLOSSARY.md: Bloom, Get ready): one layer over the game
 * canvas and under every button, so a touch clear of the buttons lands here, on every screen
 * alike. It stays mounted from play through the pause and Get ready, so the finger that opens
 * Get ready on the pause screen is the same touch whose lift is seen there, and the flow sees
 * one event per landing: whether the finger stays is the steppers' to follow through `touch`,
 * which they read on the UI thread without a render. It stops short of the grip band down each side, so a
 * finger landing there never reaches it.
 */
export const FieldTouch: React.FC<FieldTouchProps> = ({ touch, onTouch, enabled }) => {
	const handleGrant = useCallback(() => {
		touch.set({ down: true });
		onTouch();
	}, [touch, onTouch]);
	const handleEnd = useCallback(() => {
		touch.set({ down: false });
	}, [touch]);
	return (
		<View
			style={FIELD_TOUCH_FRAME}
			pointerEvents={enabled ? "auto" : "none"}
			onStartShouldSetResponder={() => enabled}
			onResponderGrant={handleGrant}
			onResponderRelease={handleEnd}
			onResponderTerminate={handleEnd}
			accessible={false}
		/>
	);
};
