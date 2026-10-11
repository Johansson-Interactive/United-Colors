import { describe, expect, it, vi } from "vitest";
import { createFloodSequence, tallySmoothFrames } from "../../presentation/effects/floodSequence";

function setup() {
	const effects = { cover: vi.fn(), lift: vi.fn() };
	const sequence = createFloodSequence(effects);
	return { effects, sequence };
}

describe("createFloodSequence", () => {
	it("covers, changes the scene once covered, and lifts only after that scene has rendered", () => {
		const { effects, sequence } = setup();
		const onCovered = vi.fn();

		sequence.run(onCovered);
		expect(sequence.stage).toBe("covering");
		expect(effects.cover).toHaveBeenCalledTimes(1);
		expect(onCovered).not.toHaveBeenCalled();

		sequence.covered();
		expect(sequence.stage).toBe("covered");
		expect(onCovered).toHaveBeenCalledTimes(1);
		// The new screen is still mounting: the dot must keep covering the old one
		expect(effects.lift).not.toHaveBeenCalled();

		sequence.sceneRendered();
		expect(sequence.stage).toBe("lifting");
		expect(effects.lift).toHaveBeenCalledTimes(1);

		sequence.lifted();
		expect(sequence.stage).toBe("idle");
	});

	it("ignores a render before the dot covers the screen", () => {
		const { effects, sequence } = setup();
		sequence.run(vi.fn());
		sequence.sceneRendered();
		expect(effects.lift).not.toHaveBeenCalled();
		expect(sequence.stage).toBe("covering");
	});

	it("ignores stray signals when idle", () => {
		const { effects, sequence } = setup();
		sequence.covered();
		sequence.sceneRendered();
		sequence.lifted();
		expect(effects.cover).not.toHaveBeenCalled();
		expect(effects.lift).not.toHaveBeenCalled();
		expect(sequence.stage).toBe("idle");
	});

	it("runs the scene change once even if covered is reported twice", () => {
		const { sequence } = setup();
		const onCovered = vi.fn();
		sequence.run(onCovered);
		sequence.covered();
		sequence.covered();
		expect(onCovered).toHaveBeenCalledTimes(1);
	});

	it("a new run restarts from covering and replaces the pending scene change", () => {
		const { effects, sequence } = setup();
		const first = vi.fn();
		const second = vi.fn();
		sequence.run(first);
		sequence.run(second);
		sequence.covered();
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
		expect(effects.cover).toHaveBeenCalledTimes(2);
	});
});

describe("tallySmoothFrames", () => {
	it("counts frames drawn at a steady rate", () => {
		let tally = 0;
		for (const frameMs of [16.7, 8.3, 16.7]) tally = tallySmoothFrames(tally, frameMs, 34);
		expect(tally).toBe(3);
	});

	it("starts over after a stalled frame, so a lift never begins across a stall", () => {
		let tally = 0;
		for (const frameMs of [16.7, 16.7]) tally = tallySmoothFrames(tally, frameMs, 34);
		expect(tally).toBe(2);
		tally = tallySmoothFrames(tally, 320, 34);
		expect(tally).toBe(0);
		tally = tallySmoothFrames(tally, 16.7, 34);
		expect(tally).toBe(1);
	});

	it("does not count a first frame with no previous one to measure against", () => {
		expect(tallySmoothFrames(0, 0, 34)).toBe(0);
	});
});
