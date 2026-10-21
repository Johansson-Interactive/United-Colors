import type React from "react";
import { createContext, use, useMemo } from "react";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { useSoundToggles } from "../hooks/useSoundToggles";

/**
 * What the title's and the pause's corner menus show and do: the sound settings with their
 * toggles, which persist
 */
interface CornerMenus {
	soundEnabled: boolean;
	musicEnabled: boolean;
	toggleSound: () => void;
	toggleMusic: () => void;
}

const CornerMenusContext = createContext<CornerMenus | null>(null);

interface CornerMenusProviderProps {
	store: GameStore;
	storage: StoragePort;
	children: React.ReactNode;
}

/** The corner menus' settings, for the overlays under it */
export const CornerMenusProvider: React.FC<CornerMenusProviderProps> = ({
	store,
	storage,
	children,
}) => {
	const soundEnabled = useStore(store, (s) => s.settings.soundEnabled);
	const musicEnabled = useStore(store, (s) => s.settings.musicEnabled);
	const { handleToggleSound, handleToggleMusic } = useSoundToggles(store, storage);

	// Only a changed setting or handler reaches the menus; the game screen's renders don't
	const value = useMemo<CornerMenus>(
		() => ({
			soundEnabled,
			musicEnabled,
			toggleSound: handleToggleSound,
			toggleMusic: handleToggleMusic,
		}),
		[soundEnabled, musicEnabled, handleToggleSound, handleToggleMusic],
	);
	return <CornerMenusContext value={value}>{children}</CornerMenusContext>;
};

export function useCornerMenus(): CornerMenus {
	const menus = use(CornerMenusContext);
	if (!menus) throw new Error("useCornerMenus must be used inside a CornerMenusProvider");
	return menus;
}
