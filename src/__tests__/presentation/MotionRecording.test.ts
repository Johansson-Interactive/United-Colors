import { describe, expect, it } from "vitest";
import type { MotionSample } from "../../domain/types";
import {
	EMPTY_RECORDING,
	LONGEST_RECORDING_MS,
	type MotionRecording,
	recordedMs,
	recordingText,
	recordSample,
} from "../../presentation/probe/motionRecording";

function sample(timeMs: number): MotionSample {
	return {
		gravity: { x: 0.123456, y: -1, z: 0 },
		rotationRate: { x: 0, y: 1.5, z: 0 },
		timeMs,
	};
}

function recorded(times: number[]): MotionRecording {
	return times.reduce((recording, t) => recordSample(recording, sample(t)), EMPTY_RECORDING);
}

describe("motion recording", () => {
	it("keeps each sample as a row, timed from the first", () => {
		const recording = recorded([5000, 5010, 5020]);
		expect(recording.rows).toHaveLength(3);
		expect(recording.rows[2]).toEqual([20, 0.1235, -1, 0, 0, 1.5, 0]);
		expect(recordedMs(recording)).toBe(20);
	});

	it("stops itself at the longest recording", () => {
		const recording = recorded([0, LONGEST_RECORDING_MS, LONGEST_RECORDING_MS + 10, 99_999]);
		expect(recording.rows).toHaveLength(2);
		expect(recording.full).toBe(true);
	});

	it("shares as JSON with its columns and platform", () => {
		const parsed = JSON.parse(recordingText(recorded([0, 10]), "ios"));
		expect(parsed.kind).toBe("tiltling-motion-recording");
		expect(parsed.platform).toBe("ios");
		expect(parsed.columns[0]).toBe("t");
		expect(parsed.rows).toHaveLength(2);
	});
});
