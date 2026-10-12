import { useCallback } from "react";
import type { GameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { updateSettings } from "../../application/useCases/UpdateSettings";

/** Flip the sound effects or the music, and persist the choice */
export function useSoundToggles(store: GameStore, storage: StoragePort) {
	const handleToggleSound = useCallback(() => {
		const settings = store.getState().settings;
		void updateSettings({ ...settings, soundEnabled: !settings.soundEnabled }, store, storage);
	}, [store, storage]);
	const handleToggleMusic = useCallback(() => {
		const settings = store.getState().settings;
		void updateSettings({ ...settings, musicEnabled: !settings.musicEnabled }, store, storage);
	}, [store, storage]);
	return { handleToggleSound, handleToggleMusic };
}
