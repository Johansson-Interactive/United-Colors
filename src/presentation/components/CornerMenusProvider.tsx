import type React from "react";
import { createContext, use, useMemo } from "react";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { useSoundToggles } from "../hooks/useSoundToggles";

/**
 * Where a corner menu opened the level bowl or the speed view from: the title, with the colour
 * the play dot showed at the tap, or the pause, whose views open in the player's colour
 */
export type MenuOpening = { from: "menu"; color: string } | { from: "pause" };

/**
 * What the title's and the pause's corner menus show and do: the sound settings with their
 * toggles, which persist, the tilt sensitivity the speed dot shows, and the views the settings
 * dots open
 */
interface CornerMenus {
	soundEnabled: boolean;
	musicEnabled: boolean;
	toggleSound: () => void;
	toggleMusic: () => void;
	/** Tilt sensitivity, a multiple of the default speed */
	sensitivity: number;
	/** Open the settle bowl to set the level pose */
	openLevel: (opening: MenuOpening) => void;
	/** Open the speed view to choose how fast the dot moves */
	openSpeed: (opening: MenuOpening) => void;
}

const CornerMenusContext = createContext<CornerMenus | null>(null);

interface CornerMenusProviderProps {
	store: GameStore;
	storage: StoragePort;
	/** The tilt sensitivity, from useSensitivitySetting, which also binds it to the session */
	sensitivity: number;
	onLevel: (opening: MenuOpening) => void;
	onSpeed: (opening: MenuOpening) => void;
	children: React.ReactNode;
}

/** The corner menus' settings and the views they open, for the overlays under it */
export const CornerMenusProvider: React.FC<CornerMenusProviderProps> = ({
	store,
	storage,
	sensitivity,
	onLevel,
	onSpeed,
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
			sensitivity,
			openLevel: onLevel,
			openSpeed: onSpeed,
		}),
		[
			soundEnabled,
			musicEnabled,
			handleToggleSound,
			handleToggleMusic,
			sensitivity,
			onLevel,
			onSpeed,
		],
	);
	return <CornerMenusContext value={value}>{children}</CornerMenusContext>;
};

export function useCornerMenus(): CornerMenus {
	const menus = use(CornerMenusContext);
	if (!menus) throw new Error("useCornerMenus must be used inside a CornerMenusProvider");
	return menus;
}
