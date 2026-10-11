import { SMOOTHING, SNAP_RAD, smoothTowards } from "../../presentation/tilt/smoothTilt";

const FRAME_MS = 1000 / 60;

/** Frames until a gap of `from` radians closes to under SNAP_RAD at the stated rate, plus one */
const framesToSnap = (from: number) =>
	Math.ceil(Math.log(SNAP_RAD / from) / Math.log(1 - SMOOTHING)) + 1;

describe("smoothTowards", () => {
	it("closes the stated fraction of the gap per 60 Hz frame while far away", () => {
		expect(smoothTowards(0, 1, FRAME_MS)).toBeCloseTo(SMOOTHING, 10);
		expect(smoothTowards(1, 0, FRAME_MS)).toBeCloseTo(1 - SMOOTHING, 10);
	});

	it("scales with frame length so a long frame equals its run of short ones", () => {
		const twoShort = smoothTowards(smoothTowards(0, 1, FRAME_MS), 1, FRAME_MS);
		expect(smoothTowards(0, 1, FRAME_MS * 2)).toBeCloseTo(twoShort, 10);
	});

	it("reaches the target exactly within a bounded number of frames and then holds still", () => {
		const target = 0.7;
		const bound = framesToSnap(target);
		let value = 0;
		let frames = 0;
		while (value !== target && frames < bound) {
			value = smoothTowards(value, target, FRAME_MS);
			frames++;
		}
		expect(value).toBe(target);
		expect(frames).toBeLessThanOrEqual(bound);
		expect(smoothTowards(value, target, FRAME_MS)).toBe(target);
	});

	it("snaps from either side and only within the snap distance", () => {
		expect(smoothTowards(0.5 + SNAP_RAD / 2, 0.5, FRAME_MS)).toBe(0.5);
		expect(smoothTowards(0.5 - SNAP_RAD / 2, 0.5, FRAME_MS)).toBe(0.5);
		expect(smoothTowards(0.5 + SNAP_RAD * 2, 0.5, FRAME_MS)).not.toBe(0.5);
	});

	it("keeps chasing a target that moves, from where it got to", () => {
		let value = smoothTowards(0, 1, FRAME_MS);
		value = smoothTowards(value, -1, FRAME_MS);
		expect(value).toBeCloseTo(SMOOTHING + (-1 - SMOOTHING) * SMOOTHING, 10);
	});
});
