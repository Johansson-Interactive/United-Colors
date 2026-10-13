import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useStore } from "zustand";
import type { GameStore } from "../../application/GameStore";
import type { StoragePort } from "../../application/ports";
import { calibrateTilt } from "../../application/useCases/CalibrateTilt";
import type { GamePhase } from "../../domain/types";
import type { FloodController } from "../effects/Flood";
import {
	type FlowAction,
	type FlowEvent,
	type FlowState,
	type FlowStep,
	INITIAL_FLOW,
	type Screen,
	screenOf,
	stepFlow,
} from "../flow/screenFlow";

const INITIAL_VIEW = { state: INITIAL_FLOW, screen: screenOf(INITIAL_FLOW) };

/**
 * The screens and the floods between them (see screenFlow.ts), fed the game's phase as the
 * store changes. Each step answers with the screen
 * to show, may save a level pose and may start a flood, which runs `perform` once it covers
 * the screen. Returns the screen and the dispatch for the screen's taps.
 */
export function useScreenFlow(
	store: GameStore,
	storage: StoragePort,
	flood: FloodController,
	perform: (action: FlowAction) => void,
): { screen: Screen; dispatch: (event: FlowEvent) => void } {
	const [view, setView] = useState<Pick<FlowStep, "state" | "screen">>(INITIAL_VIEW);
	const flowRef = useRef<FlowState>(INITIAL_FLOW);
	const dispatch = useCallback(
		(event: FlowEvent) => {
			const apply = (next: FlowEvent): FlowStep => {
				const step = stepFlow(flowRef.current, next);
				flowRef.current = step.state;
				setView({ state: step.state, screen: step.screen });
				return step;
			};
			const step = apply(event);
			if (step.calibrate) {
				void calibrateTilt(step.calibrate.zero, store, storage, step.calibrate.facingDown);
			}
			if (step.act) perform(step.act);
			if (step.flood) {
				const { color, at, action } = step.flood;
				flood.run(color, at.x, at.y, () => {
					apply({ type: "covered" });
					perform(action);
				});
			}
		},
		[flood, perform, store, storage],
	);

	// The rest of the screen reads the phase through the store, which renders ahead of a state
	// update; stepping here keeps the screen from trailing it by a frame
	const phase = useStore(store, (s) => s.frame.phase);
	if (view.state.phase !== phase) {
		const step = stepFlow(view.state, { type: "phaseChanged", phase });
		setView({ state: step.state, screen: step.screen });
	}

	// The flow the taps step from takes the phase the moment the store changes, even mid-dispatch
	const phaseChanged = useEffectEvent((next: GamePhase) =>
		dispatch({ type: "phaseChanged", phase: next }),
	);

	useEffect(() => {
		phaseChanged(store.getState().frame.phase);
		return store.subscribe((state, previous) => {
			if (state.frame.phase !== previous.frame.phase) phaseChanged(state.frame.phase);
		});
	}, [store]);

	return { screen: view.screen, dispatch };
}
