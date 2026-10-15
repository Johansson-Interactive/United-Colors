/**
 * Where the game sits in the window. It keeps clear of the top inset (notch / Dynamic
 * Island) and the side insets, which stay black like the phone's glass, so the playfield's
 * walls read as the edge of the screen. It runs under the home indicator, to the bottom.
 * Everything the game draws lives in this box (see StageFrame.tsx).
 */

export interface Insets {
	top: number;
	left: number;
	right: number;
	bottom: number;
}

export interface StageBox {
	top: number;
	left: number;
	width: number;
	height: number;
}

/** The game's box in a `width` x `height` window with these safe-area `insets` */
export function stageBox(width: number, height: number, insets: Insets): StageBox {
	return {
		top: insets.top,
		left: insets.left,
		width: Math.max(0, width - insets.left - insets.right),
		height: Math.max(0, height - insets.top),
	};
}
