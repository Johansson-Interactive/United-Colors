import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import { createFlowStore, type FlowSinks } from "../flow/flowStore";
import type { FlowEvent, Screen } from "../flow/screenFlow";

/**
 * The screens and the floods between them (see flowStore.ts), following the game's phase.
 * Returns the screen to show and the dispatch for the screen's taps. The sinks are taken once.
 */
export function useScreenFlow(
	store: GameStore,
	sinks: FlowSinks,
): { screen: Screen; dispatch: (event: FlowEvent) => void } {
	const [flow] = useState(() => createFlowStore(store, sinks));
	useEffect(() => flow.getState().dispose, [flow]);
	const screen = useStore(flow, (s) => s.screen);
	const dispatch = useStore(flow, (s) => s.dispatch);
	return { screen, dispatch };
}
