import type React from "react";
import { createContext, use, useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Corners } from "../../domain/types";
import { FrameCorners } from "../components/FrameCorners";
import { type StageBox, stageBox } from "./stageBox";

const StageBoxContext = createContext<StageBox | null>(null);

interface StageFrameProps {
	/** How the phone's glass rounds its corners; the frame's corners follow (null: square) */
	corners: Corners | null;
	children: React.ReactNode;
}

/**
 * The box everything the game draws lives in (see stageBox.ts), clipped to it and with its
 * corners rounded off as the dots feel them (see arena.ts), so nothing (the room, the flood,
 * the confetti) spills over the black safe-area insets. Inside, useStageBox gives its size
 * in place of the window's.
 */
export const StageFrame: React.FC<StageFrameProps> = ({ corners, children }) => {
	const { width, height } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const box = useMemo(() => stageBox(width, height, insets), [width, height, insets]);
	const screen = useMemo(
		() => ({ width: box.width, height: box.height, corners: corners ?? undefined }),
		[box.width, box.height, corners],
	);
	return (
		<StageBoxContext value={box}>
			<View style={[styles.frame, box]}>
				{children}
				<FrameCorners screen={screen} />
			</View>
		</StageBoxContext>
	);
};

/** The game's box in the window: its size, and where it sits for window coordinates */
export function useStageBox(): StageBox {
	const box = use(StageBoxContext);
	if (!box) throw new Error("useStageBox must be used inside StageFrame");
	return box;
}

const styles = StyleSheet.create({
	frame: { position: "absolute", overflow: "hidden" },
});
