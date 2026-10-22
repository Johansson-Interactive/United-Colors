import { Canvas, Picture, Skia } from "@shopify/react-native-skia";
import type React from "react";
import { useEffect, useState } from "react";
import { type SharedValue, useDerivedValue, useSharedValue } from "react-native-reanimated";
import type { ScoreTally } from "../hooks/useScoreTally";
import { useStageBox } from "../layout/StageFrame";
import { recordPicture } from "../recordPicture";
import { drawTally } from "../sceneDrawer";
import { PlaySide, type PortalCut } from "./PlaySide";

interface ScoreMeterProps {
	/** The tally to draw, fed from the game (see useScoreTally) */
	score: ScoreTally;
	/**
	 * The player's current colour, followed on the UI thread; the total wears it so a switch is
	 * always visible
	 */
	color: SharedValue<string>;
	/** Whether the meter is on screen */
	visible: boolean;
	/** The portal it is cut to, on the play side, while the pause world is under it (see PlaySide) */
	cut: PortalCut | null;
}

/**
 * The score at the top of the stage and the score slivers flying into it across the field
 * (see scoreTally.ts), on a canvas the size of the stage, on the play side: over the pause
 * world the portal covers and uncovers it like the rest of the field. Nothing here goes through React: the
 * tally's lane stamps, ages and drops each catch on the UI thread each frame while anything
 * moves, and the picture is recorded there at the lane's time, which runs only while
 * something moves. Hidden it draws nothing, so being shown again always records the meter
 * afresh: a canvas hidden over the pause and the bowl has been seen to come back blank, and
 * the tally, standing still, would not have drawn it again until the next catch.
 */
export const ScoreMeter: React.FC<ScoreMeterProps> = ({ score, color, visible, cut }) => {
	const { tally, clock } = score;
	const { width, height } = useStageBox();
	// Parsed only when the colour changes, not with the tally every frame
	const scoreColor = useDerivedValue(() => Skia.Color(color.get()));

	const shown = useSharedValue(visible);
	useEffect(() => shown.set(visible), [shown, visible]);

	// Re-recorded only while something moves, or as the meter is shown or hidden
	const [recorder] = useState(() => Skia.PictureRecorder());
	const picture = useDerivedValue(() =>
		recordPicture(recorder, (canvas) => {
			if (shown.get()) drawTally(canvas, tally.get(), clock.get(), scoreColor.get());
		}),
	);

	return (
		<Canvas style={{ width, height }} pointerEvents="none">
			<PlaySide cut={cut}>
				<Picture picture={picture} />
			</PlaySide>
		</Canvas>
	);
};
