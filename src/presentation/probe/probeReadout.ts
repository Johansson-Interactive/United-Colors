import { swivelRate, uprightness } from "../../domain/tilt";
import type { MotionSample } from "../../domain/types";

/**
 * The motion probe's readout: what a dev build shows of the phone's motion while its raw samples
 * are recorded (ADR 0016, ADR 0017). Shipped builds never show it.
 */

const DEGREES = 180 / Math.PI;

/** The latest sample as the readout's line: how upright the phone stands and how fast it swivels */
export function describeMotion(sample: MotionSample | null): string {
	if (!sample) return "no motion yet";
	const upright = Math.round(uprightness(sample.gravity) * DEGREES);
	const swivel = Math.round(swivelRate(sample) * DEGREES);
	return `upright ${upright}°  swivel ${swivel}°/s`;
}
