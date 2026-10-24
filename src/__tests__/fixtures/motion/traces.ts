/// <reference types="vite/client" />
import type { MotionSample } from "../../../domain/types";

/** A motion recording shared from the probe build (see presentation/probe/motionRecording.ts) */
interface Recording {
	kind: "tiltling-motion-recording";
	platform: string;
	rows: number[][];
}

/** Every recording in this folder, keyed by its path from here */
const RECORDINGS = import.meta.glob<Recording>("./*.json", { import: "default", eager: true });

/** The samples of a recorded trace in this folder, by file name */
export function trace(name: string): MotionSample[] {
	const recording = RECORDINGS[`./${name}`];
	if (!recording) throw new Error(`no recorded trace ${name}`);
	return recording.rows.map(([t, gx, gy, gz, rx, ry, rz, ax, ay, az]) => ({
		gravity: { x: gx, y: gy, z: gz },
		rotationRate: { x: rx, y: ry, z: rz },
		acceleration: { x: ax, y: ay, z: az },
		timeMs: t,
	}));
}
