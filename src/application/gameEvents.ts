import type { GameEvent, RenderFrame } from "../domain/types";
import type { GameStore } from "./GameStore";

/**
 * Call `listener` for each event of every new frame, in order and once; returns the
 * unsubscribe. Store changes that keep the frame (settings, the best) report nothing.
 */
export function onGameEvents(
	store: GameStore,
	listener: (event: GameEvent, frame: RenderFrame) => void,
): () => void {
	return store.subscribe((state, previous) => {
		const frame = state.frame;
		if (frame === previous.frame) return;
		for (const event of frame.events) listener(event, frame);
	});
}
