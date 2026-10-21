import { useEffect } from "react";
import type { GameStore } from "../../application/GameStore";
import type { GameAudio, GameHaptics, StoragePort } from "../../application/ports";
import { bindHaptics } from "../../application/useCases/BindHaptics";
import { bindMusic } from "../../application/useCases/BindMusic";
import { bindSoundEffects } from "../../application/useCases/BindSoundEffects";
import { bindSoundSetting } from "../../application/useCases/BindSoundSetting";
import { loadHighScore } from "../../application/useCases/LoadHighScore";
import { loadSettings } from "../../application/useCases/LoadSettings";

/**
 * What the game screen binds to the store for as long as it is up: the sounds and the buzz
 * that follow the game, and the saved settings and best it starts from.
 */
export function useGameBindings(
	store: GameStore,
	audio: GameAudio,
	haptics: GameHaptics,
	storage: StoragePort,
): void {
	// Sounds load with the screen and follow the music and effect settings; the effects follow
	// the game's events and the music the phase. Dispose discards a load in flight.
	useEffect(() => {
		void audio.load();
		const unbindSetting = bindSoundSetting(store, audio);
		const unbindEffects = bindSoundEffects(store, audio);
		const unbindMusic = bindMusic(store, audio);
		return () => {
			unbindMusic();
			unbindEffects();
			unbindSetting();
			audio.dispose();
		};
	}, [audio, store]);

	// A buzz as the player spits out a wrong-colour dot
	useEffect(() => bindHaptics(store, haptics), [store, haptics]);

	// Restore persisted settings and high score
	useEffect(() => {
		void loadSettings(store, storage);
		void loadHighScore(store, storage);
	}, [store, storage]);
}
