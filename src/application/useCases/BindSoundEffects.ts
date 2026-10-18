import { catchPitch, createCatchStagger } from "../catchCue";
import type { GameStore } from "../GameStore";
import { onGameEvents } from "../gameEvents";
import type { GameAudio } from "../ports";

/**
 * A sound for each catch and spawn, and the stinger as a run ends; the spit is felt, not
 * heard, and a combo's end is silent. A catch sounds higher the further into its combo it is,
 * and catches on the same tick sound one after the other (see catchCue). Returns the
 * unsubscribe.
 */
export function bindSoundEffects(store: GameStore, audio: GameAudio): () => void {
	const held = new Set<ReturnType<typeof setTimeout>>();
	const stagger = createCatchStagger((cue, ms) => {
		const timer = setTimeout(() => {
			held.delete(timer);
			cue();
		}, ms);
		held.add(timer);
	});

	const unsubscribe = onGameEvents(store, (event) => {
		switch (event.type) {
			case "collect":
				stagger(event.sameTick, () => audio.playCollect(catchPitch(event.step)));
				return;
			case "collectPoint":
				stagger(event.sameTick, () => audio.playLargeCollect(catchPitch(event.step)));
				return;
			case "pointSpawn":
				audio.playPointSpawn();
				return;
			case "gameOver":
				audio.playGameOver();
				return;
			case "spit":
			case "comboEnd":
				return;
		}
	});
	return () => {
		unsubscribe();
		for (const timer of held) clearTimeout(timer);
		held.clear();
	};
}
