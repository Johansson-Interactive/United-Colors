import type { RenderFrame } from "../../domain/types";
import type { GameHaptics } from "../GameHaptics";
import type { GameStore } from "../GameStore";
import { REJECT_SPIT_AT } from "../rejection";

function rejectOf(frame: RenderFrame): number | undefined {
	return frame.dots.find((d) => d.reject !== undefined)?.reject;
}

/**
 * Buzz once as the player spits out a wrong-colour dot: on the first frame whose refusal
 * has crossed REJECT_SPIT_AT. Returns the unsubscribe.
 */
export function bindRejectHaptic(store: GameStore, haptics: GameHaptics): () => void {
	return store.subscribe((state, previous) => {
		if (state.frame.phase !== "REJECTING") return;
		const now = rejectOf(state.frame);
		if (now === undefined || now < REJECT_SPIT_AT) return;
		const before = rejectOf(previous.frame);
		if (before !== undefined && before >= REJECT_SPIT_AT) return;
		haptics.spit();
	});
}
