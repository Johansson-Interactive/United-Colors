/**
 * The one place the screen flow's state lives (see screenFlow.ts). The game's phase changes
 * and the screen's taps step the same state, synchronously, so the screen and the phase it
 * shows change in the same moment.
 */

import { createStore } from "zustand/vanilla";
import type { GameStore } from "../../application/GameStore";
import type { GamePhase, TiltZero } from "../../domain/types";
import type { PressPoint } from "../components/DotButton";
import {
	type FlowAction,
	type FlowEvent,
	type FlowState,
	INITIAL_FLOW,
	type Screen,
	screenOf,
	stepFlow,
} from "./screenFlow";

/** What the flow does outside itself; the shell supplies them */
export interface FlowSinks {
	/** Do this to the game */
	perform: (action: FlowAction) => void;
	/** Grow a dot of `color` from `at` until it covers the screen, then call `onCovered` */
	flood: (color: string, at: PressPoint, onCovered: () => void) => void;
	/** Adopt `zero` as the level pose for the side the screen faced */
	calibrate: (zero: TiltZero, facingDown: boolean) => void;
}

export interface FlowStoreState {
	/** The screen to show */
	screen: Screen;
	/** Step a tap, then carry out what the step asks: calibrate, act, flood */
	dispatch: (event: FlowEvent) => void;
}

/**
 * The flow store, starting on the screen of the game's phase, and `follow`, which keeps it on
 * the game's phase until the unsubscribe it returns is called. Creating the store has no side
 * effects; following can stop and start again, catching up on the phase each time it starts.
 */
export function createFlowStore(game: GameStore, sinks: FlowSinks) {
	let flow: FlowState = INITIAL_FLOW;
	const store = createStore<FlowStoreState>(() => ({
		screen: screenOf(INITIAL_FLOW),
		dispatch,
	}));

	const apply = (event: FlowEvent) => {
		const step = stepFlow(flow, event);
		flow = step.state;
		store.setState({ screen: step.screen });
		return step;
	};

	function dispatch(event: FlowEvent) {
		const step = apply(event);
		if (step.calibrate) sinks.calibrate(step.calibrate.zero, step.calibrate.facingDown);
		if (step.act) sinks.perform(step.act);
		if (step.flood) {
			const { color, at, action } = step.flood;
			sinks.flood(color, at, () => {
				apply({ type: "covered" });
				sinks.perform(action);
			});
		}
	}

	const toPhase = (phase: GamePhase) => {
		if (phase !== flow.phase) apply({ type: "phaseChanged", phase });
	};
	toPhase(game.getState().frame.phase);

	const follow = () => {
		toPhase(game.getState().frame.phase);
		return game.subscribe((state) => toPhase(state.frame.phase));
	};

	return { store, follow };
}
