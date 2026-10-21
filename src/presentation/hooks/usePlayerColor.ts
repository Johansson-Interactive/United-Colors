import { useEffect } from "react";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { useStore } from "zustand";
import type { GameStore, GameStoreState } from "../../application/GameStore";
import { WHITE } from "../theme/theme";

/** The player dot's colour, white while there is none */
export const playerColorOf = (s: GameStoreState) =>
	s.frame.dots.find((d) => d.kind === "player")?.color ?? WHITE;

/**
 * The player dot's colour as it changes in play, for what draws on the UI thread. A catch of a
 * point dot switches it; following it here rather than in React keeps that catch from
 * re-rendering the screen in the middle of play.
 */
export function usePlayerColor(store: GameStore): SharedValue<string> {
	const color = useSharedValue(playerColorOf(store.getState()));
	useEffect(() => {
		let last = playerColorOf(store.getState());
		color.set(last);
		return store.subscribe((state) => {
			const next = playerColorOf(state);
			if (next === last) return;
			last = next;
			color.set(next);
		});
	}, [store, color]);
	return color;
}

/**
 * The player dot's colour for the screens over a run that is not moving: the pause, Get ready
 * and the game over, where it cannot change. Null while a run is going, so the catches that
 * switch it render nothing (see usePlayerColor for what follows it then).
 */
export function useRestingPlayerColor(store: GameStore): string | null {
	return useStore(store, (s) => (s.frame.phase === "RUNNING" ? null : playerColorOf(s)));
}
