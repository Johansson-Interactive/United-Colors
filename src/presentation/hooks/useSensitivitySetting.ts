import { useCallback, useEffect } from "react";
import { useStore } from "zustand";
import type { GameSession } from "../../application/GameSession";
import type { GameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { bindSensitivity } from "../../application/useCases/BindSensitivity";
import { updateSettings } from "../../application/useCases/UpdateSettings";

/**
 * The tilt sensitivity (a multiple of the default speed): it reaches the game as soon as it
 * is chosen or loaded, and the interface reads it here so the bowls and the level roll at the
 * same speed. Returns it with a setter that persists the choice.
 */
export function useSensitivitySetting(
	store: GameStore,
	storage: StoragePort,
	session: GameSession,
) {
	const sensitivity = useStore(store, (s) => s.settings.tiltSensitivity);

	useEffect(
		() => bindSensitivity(store, (multiplier) => session.setSensitivity(multiplier)),
		[session, store],
	);

	const setSensitivity = useCallback(
		(tiltSensitivity: number) => {
			const settings = store.getState().settings;
			if (settings.tiltSensitivity === tiltSensitivity) return;
			void updateSettings({ ...settings, tiltSensitivity }, store, storage);
		},
		[store, storage],
	);
	return { sensitivity, setSensitivity };
}
