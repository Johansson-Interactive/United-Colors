import {
	ARC_GAUGE_START,
	type ArcGauge,
	levelAcceleration,
	type Swivel,
	stepArcGauge,
	uprightness,
} from "../../domain/swivelArc";
import type { MotionSample } from "../../domain/types";

/**
 * The motion probe's readout: what a dev build shows of the phone's motion, so the arc that
 * tells a turn on the spot from a wrist roll can be set from recordings on a real phone
 * (ADR 0016). Shipped builds never show it.
 */

/** How many finished swivels the readout keeps, latest first: about a screenful */
const KEPT_SWIVELS = 40;

const DEGREES = 180 / Math.PI;

export interface ProbeState {
	gauge: ArcGauge;
	/** How far the screen stands from flat (degrees) */
	uprightDeg: number;
	/** The level push of the latest sample (metres a second squared) */
	push: number;
	/** Finished swivels, latest first */
	swivels: readonly Swivel[];
}

export const PROBE_START: ProbeState = {
	gauge: ARC_GAUGE_START,
	uprightDeg: 0,
	push: 0,
	swivels: [],
};

/** The readout after one more sample, and the swivel it ended, if any */
export function stepProbe(
	state: ProbeState,
	sample: MotionSample,
): { state: ProbeState; ended: Swivel | null } {
	const { gauge, ended } = stepArcGauge(state.gauge, sample);
	return {
		state: {
			gauge,
			uprightDeg: uprightness(sample.gravity) * DEGREES,
			push: levelAcceleration(sample),
			swivels: ended ? [ended, ...state.swivels].slice(0, KEPT_SWIVELS) : state.swivels,
		},
		ended,
	};
}

/** The readout cleared of finished swivels */
export function clearProbe(state: ProbeState): ProbeState {
	return { ...state, swivels: [] };
}

/** One finished swivel as a line of the readout */
export function describeSwivel(swivel: Swivel): string {
	const arc = swivel.radius === null ? "arc ?" : `arc ${Math.round(swivel.radius * 100)} cm`;
	const turned = Math.round(swivel.turned * DEGREES);
	const peak = Math.round(swivel.peakRate * DEGREES);
	const { decided } = swivel;
	const call = decided
		? `turn @ ${Math.round(decided.afterMs)} ms ${Math.round(decided.afterTurn * DEGREES)}°`
		: "roll";
	return `${call}  ${arc}  turned ${turned}°  peak ${peak}°/s  ${Math.round(swivel.durationMs)} ms`;
}

/** The live part of the readout */
export function describeLive(state: ProbeState): string {
	const rate = Math.round(state.gauge.rate * DEGREES);
	return `upright ${Math.round(state.uprightDeg)}°  swivel ${rate}°/s  push ${state.push.toFixed(2)} m/s²`;
}
