import type { MotionSample } from "../../domain/types";

/**
 * A recording of raw motion samples in the probe build, shared off the phone as text so tilt
 * can be checked against real motion, and the traces kept as test fixtures (ADR 0016).
 */

/** The longest recording (ms of sample time); it stops itself there */
export const LONGEST_RECORDING_MS = 60_000;

/** The columns of each row, in order */
const COLUMNS = ["t", "gx", "gy", "gz", "rx", "ry", "rz"] as const;

/** Four decimals: well under the sensors' noise, and a third of the text */
function rounded(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}

/** One recording, filled a sample at a time; a fresh one for each take */
export class MotionRecording {
	/** One row per sample, in COLUMNS order; time in ms from the first sample */
	private readonly rows: number[][] = [];
	/** The first sample's time (ms, on the sensors' clock); null before it */
	private startMs: number | null = null;
	private isFull = false;

	/** Keep one more sample, unless the recording is full */
	record(sample: MotionSample): void {
		if (this.isFull) return;
		this.startMs ??= sample.timeMs;
		const t = sample.timeMs - this.startMs;
		if (t > LONGEST_RECORDING_MS) {
			this.isFull = true;
			return;
		}
		const { gravity: g, rotationRate: r } = sample;
		this.rows.push([t, g.x, g.y, g.z, r.x, r.y, r.z].map(rounded));
	}

	/** Whether it has reached LONGEST_RECORDING_MS and takes no more */
	get full(): boolean {
		return this.isFull;
	}

	/** How many samples it holds */
	get samples(): number {
		return this.rows.length;
	}

	/** How long it runs so far (ms) */
	get ms(): number {
		return this.rows.at(-1)?.[0] ?? 0;
	}

	/**
	 * The recording as JSON text: what it is, its columns (gravity unit and rate in radians a
	 * second, both in the phone's axes) and its rows
	 */
	text(platform: string): string {
		return JSON.stringify({
			kind: "tiltling-motion-recording",
			version: 2,
			platform,
			columns: COLUMNS,
			rows: this.rows,
		});
	}
}
