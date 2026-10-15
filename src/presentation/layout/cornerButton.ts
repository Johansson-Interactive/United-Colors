import { cornerExtent, holdInside } from "../../domain/arena";
import type { ScreenSize } from "../../domain/types";

/** How far a round button sits from the frame's top and right edges, for its style */
export interface CornerOffset {
	top: number;
	right: number;
}

/**
 * Where a round button of `size` sits in the frame's top-right corner: `offset` from the
 * straight edges, and at least as far clear of the rounded corner, so a deep curve pushes it
 * in along the diagonal rather than crowding it against the glass
 */
export function cornerButton(screen: ScreenSize, size: number, offset: CornerOffset): CornerOffset {
	if (cornerExtent(screen) === 0) return offset;
	const radius = size / 2;
	const x = screen.width - offset.right - radius;
	const y = offset.top + radius;
	const held = holdInside(screen, x, y, radius + Math.max(offset.top, offset.right));
	return {
		top: Math.max(offset.top, held.y - radius),
		right: Math.max(offset.right, screen.width - held.x - radius),
	};
}
