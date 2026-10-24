import { describe, expect, it } from "vitest";
import type { MotionSample } from "../../domain/types";
import { LONGEST_RECORDING_MS, MotionRecording } from "../../presentation/probe/motionRecording";

function sample(timeMs: number): MotionSample {
	return {
		gravity: { x: 0.123456, y: -1, z: 0 },
		rotationRate: { x: 0, y: 1.5, z: 0 },
		timeMs,
	};
}

function recorded(times: number[]): MotionRecording {
	const recording = new MotionRecording();
	for (const t of times) recording.record(sample(t));
	return recording;
}

describe("motion recording", () => {
	it("keeps each sample as a row, timed from the first", () => {
		const recording = recorded([5000, 5010, 5020]);
		expect(recording.samples).toBe(3);
		expect(JSON.parse(recording.text("ios")).rows[2]).toEqual([20, 0.1235, -1, 0, 0, 1.5, 0]);
		expect(recording.ms).toBe(20);
	});

	it("stops itself at the longest recording", () => {
		const recording = recorded([0, LONGEST_RECORDING_MS, LONGEST_RECORDING_MS + 10, 99_999]);
		expect(recording.samples).toBe(2);
		expect(recording.full).toBe(true);
	});

	it("shares as JSON with its columns and platform", () => {
		const parsed = JSON.parse(recorded([0, 10]).text("ios"));
		expect(parsed.kind).toBe("tiltling-motion-recording");
		expect(parsed.platform).toBe("ios");
		expect(parsed.columns[0]).toBe("t");
		expect(parsed.rows).toHaveLength(2);
	});
});
