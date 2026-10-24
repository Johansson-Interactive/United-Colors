import type { MotionSample } from "../../domain/types";

/**
 * A recording of raw motion samples in the probe build, shared off the phone as text so the
 * call between a turn on the spot and a wrist roll can be tuned against real motion, and the
 * traces kept as test fixtures (ADR 0016).
 */

/** The longest recording (ms of sample time); it stops itself there */
export const LONGEST_RECORDING_MS = 30_000;

/** The columns of each row, in order */
const COLUMNS = ["t", "gx", "gy", "gz", "rx", "ry", "rz", "ax", "ay", "az"] as const;

export interface MotionRecording {
	/** One row per sample, in COLUMNS order; time in ms from the first sample */
	rows: readonly (readonly number[])[];
	/** The first sample's time (ms, on the sensors' clock); null before it */
	startMs: number | null;
	/** Whether it has reached LONGEST_RECORDING_MS and takes no more */
	full: boolean;
}

export const EMPTY_RECORDING: MotionRecording = { rows: [], startMs: null, full: false };

/** Four decimals: well under the sensors' noise, and a third of the text */
function rounded(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}

/** The recording with one more sample, unless it is full */
export function recordSample(recording: MotionRecording, sample: MotionSample): MotionRecording {
	if (recording.full) return recording;
	const startMs = recording.startMs ?? sample.timeMs;
	const t = sample.timeMs - startMs;
	if (t > LONGEST_RECORDING_MS) return { ...recording, full: true };
	const { gravity: g, rotationRate: r, acceleration: a } = sample;
	const row = [t, g.x, g.y, g.z, r.x, r.y, r.z, a.x, a.y, a.z].map(rounded);
	return { rows: [...recording.rows, row], startMs, full: false };
}

/** How long the recording runs so far (ms) */
export function recordedMs(recording: MotionRecording): number {
	return recording.rows.at(-1)?.[0] ?? 0;
}

/**
 * The recording as JSON text: what it is, its columns (gravity unit, rate in radians a second,
 * push in metres a second squared, all in the phone's axes) and its rows
 */
export function recordingText(recording: MotionRecording, platform: string): string {
	return JSON.stringify({
		kind: "tiltling-motion-recording",
		version: 1,
		platform,
		columns: COLUMNS,
		rows: recording.rows,
	});
}
