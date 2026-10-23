import { useMemo } from "react";
import { cornerExtent } from "../../domain/arena";
import type { Corners } from "../../domain/types";
import type { FieldSize } from "../effects/portal";
import { useStageBox } from "../layout/StageFrame";

/** The playfield as the portals open on it: the stage's size, and how far its corners round (null: square) */
export function useFieldSize(corners: Corners | null): FieldSize {
	const { width, height } = useStageBox();
	return useMemo(
		() => ({
			width,
			height,
			cornerExtent: cornerExtent({ width, height, corners: corners ?? undefined }),
		}),
		[width, height, corners],
	);
}
