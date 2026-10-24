/**
 * The one place the screen flow's state lives (see screenFlow.ts). The game's phase changes
 * and the screen's taps step the same state, synchronously, so the screen and the phase it
 * shows change in the same moment.
 */

import { createStore } from "zustand/vanilla";
import type { GameStore } from "../../application/GameStore";
import type { GamePhase } from "../../domain/types";
import type { PressPoint } from "../components/DotButton";
import {
	type FlowAction,
	type FlowEvent,
	type FlowState,
	type GameFacts,
	INITIAL_FLOW,
	type Screen,
	screenOf,
	stepFlow,
} from "./screenFlow";

/**
 * Everything the flow does outside itself; the shell adapts the game to it. Each action's kind is
 * the name of the control that carries it out. The flow store takes it once, when it is created,
 * and keeps it for its lifetime, so what it closes over must not change.
 */
export interface GameControls {
	/** Start a run with the player in `color` */
	play: (color: string) => void;
	pause: () => void;
	resume: () => void;
	/** Start the kiosk afresh */
	startKiosk: () => void;
	/** Stop the kiosk and hide it, so only what opened over it moves */
	haltKiosk: () => void;
	/** Show the kiosk again and run it on from where it stopped */
	runKiosk: () => void;
	/** Grow a dot of `color` from `at` until it covers the screen, then call `onCovered` */
	flood: (color: string, at: PressPoint, onCovered: () => void) => void;
	/** Take the level pose where the phone is held now */
	takeLevelPose: () => void;
	/** The game's answers to what the flow asks, as they stand at this moment */
	facts: () => GameFacts;
}

/**
 * Carry out `action` on the game, through the control of the same name. A run starts from a
 * level pose taken as it begins (ADR 0016): under a flood that is once it covers, when the
 * jolt of the tap has passed and the hand holds the grip it plays in.
 */
function perform(controls: GameControls, action: FlowAction) {
	if (action.kind === "play") {
		controls.takeLevelPose();
		controls.play(action.color);
	} else controls[action.kind]();
}

export interface FlowStoreState {
	/** The screen to show */
	screen: Screen;
	/** Step a tap, then carry out what the step asks: take the level pose, act, flood */
	dispatch: (event: FlowEvent) => void;
}

/**
 * The flow store, starting on the screen of the game's phase, and `follow`, which keeps it on
 * the game's phase until the unsubscribe it returns is called. Creating the store has no side
 * effects; following can stop and start again, catching up on the phase each time it starts.
 */
export function createFlowStore(game: GameStore, controls: GameControls) {
	let flow: FlowState = INITIAL_FLOW;
	const store = createStore<FlowStoreState>(() => ({
		screen: screenOf(INITIAL_FLOW),
		dispatch,
	}));

	const apply = (event: FlowEvent) => {
		const step = stepFlow(flow, event, controls.facts());
		flow = step.state;
		store.setState({ screen: step.screen });
		return step;
	};

	function dispatch(event: FlowEvent) {
		const step = apply(event);
		if (step.takeLevelPose) controls.takeLevelPose();
		if (step.act) perform(controls, step.act);
		if (step.flood) {
			const { color, at, action } = step.flood;
			controls.flood(color, at, () => {
				apply({ type: "covered" });
				perform(controls, action);
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
