import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_HERTZ } from "../../domain/constants";
import { FrameClock } from "../../infrastructure/FrameClock";

const STEP_MS = 1000 / GAME_HERTZ;
const MAX_UPDATES_PER_FRAME = 5;

/**
 * A hand-cranked animation frame: the clock asks for one frame at a time and `renderAt`
 * advances the stubbed wall clock to `nowMs` and runs it.
 */
function fakeFrames() {
	let now = 0;
	let nextId = 1;
	let pending: { id: number; callback: FrameRequestCallback } | null = null;
	let lastRequested: FrameRequestCallback | null = null;
	const cancel = vi.fn((id: number) => {
		if (pending?.id === id) pending = null;
	});
	vi.stubGlobal("performance", { now: () => now });
	vi.stubGlobal(
		"requestAnimationFrame",
		vi.fn((callback: FrameRequestCallback) => {
			pending = { id: nextId++, callback };
			lastRequested = callback;
			return pending.id;
		}),
	);
	vi.stubGlobal("cancelAnimationFrame", cancel);
	return {
		cancel,
		get hasPending() {
			return pending !== null;
		},
		renderAt(nowMs: number) {
			now = nowMs;
			const frame = pending;
			pending = null;
			frame?.callback(now);
		},
		/** Run the last requested callback even if it was cancelled, as a frame already in flight */
		renderStaleAt(nowMs: number) {
			now = nowMs;
			lastRequested?.(now);
		},
	};
}

function startClock(frames: ReturnType<typeof fakeFrames>, startMs = 0) {
	const onTick = vi.fn();
	const onFrame = vi.fn<(dtMs: number, alpha: number) => void>();
	const clock = new FrameClock(onTick, onFrame);
	frames.renderAt(startMs);
	clock.start();
	return { clock, onTick, onFrame };
}

describe("FrameClock", () => {
	let frames: ReturnType<typeof fakeFrames>;

	beforeEach(() => {
		frames = fakeFrames();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("runs a frame at once on start, with no tick, and asks for the next one", () => {
		const { onTick, onFrame } = startClock(frames);
		expect(onTick).not.toHaveBeenCalled();
		expect(onFrame).toHaveBeenCalledWith(0, 0);
		expect(frames.hasPending).toBe(true);
	});

	it("ticks once per simulation step of elapsed time, however frames fall", () => {
		const { onTick } = startClock(frames);
		frames.renderAt(STEP_MS / 2);
		expect(onTick).not.toHaveBeenCalled();
		frames.renderAt(STEP_MS + 0.1);
		expect(onTick).toHaveBeenCalledTimes(1);
		frames.renderAt(STEP_MS * 3 + 0.1);
		expect(onTick).toHaveBeenCalledTimes(3);
	});

	it("keeps the simulation in step with wall time over many uneven frames", () => {
		const { onTick } = startClock(frames);
		// Render at 60 Hz for a second, with jitter that never exceeds a step
		let t = 0;
		for (let i = 0; i < 60; i++) {
			t += 1000 / 60 + (i % 3) - 1;
			frames.renderAt(t);
		}
		expect(onTick).toHaveBeenCalledTimes(Math.floor(t / STEP_MS));
	});

	it("reports alpha as the fraction of a step since the last tick, below one", () => {
		const { onFrame } = startClock(frames);
		frames.renderAt(STEP_MS * 1.25);
		const [dtMs, alpha] = onFrame.mock.lastCall ?? [];
		expect(dtMs).toBeCloseTo(STEP_MS * 1.25);
		expect(alpha).toBeCloseTo(0.25);
		frames.renderAt(STEP_MS * 1.75);
		expect(onFrame.mock.lastCall?.[1]).toBeCloseTo(0.75);
		for (const [, a] of onFrame.mock.calls) {
			expect(a).toBeGreaterThanOrEqual(0);
			expect(a).toBeLessThan(1);
		}
	});

	it("caps a long stall at five ticks, one step of carry-over and a clamped frame delta", () => {
		const { onTick, onFrame } = startClock(frames);
		frames.renderAt(1000);
		expect(onTick).toHaveBeenCalledTimes(MAX_UPDATES_PER_FRAME);
		expect(onFrame).toHaveBeenLastCalledWith(STEP_MS * MAX_UPDATES_PER_FRAME, 1);

		// Only one step was kept, so the next frame pays it back and no more
		frames.renderAt(1000 + STEP_MS / 2);
		expect(onTick).toHaveBeenCalledTimes(MAX_UPDATES_PER_FRAME + 1);
		expect(onFrame.mock.lastCall?.[1]).toBeCloseTo(0.5);
	});

	it("leaves a backlog under five steps alone so no time is lost", () => {
		const { onTick, onFrame } = startClock(frames);
		frames.renderAt(STEP_MS * 4.5);
		expect(onTick).toHaveBeenCalledTimes(4);
		expect(onFrame.mock.lastCall?.[1]).toBeCloseTo(0.5);
	});

	it("stop cancels the pending frame and ignores a frame that still arrives", () => {
		const { clock, onTick, onFrame } = startClock(frames);
		clock.stop();
		expect(frames.cancel).toHaveBeenCalledTimes(1);
		expect(frames.hasPending).toBe(false);

		// A frame callback that was already dispatched before the cancel landed
		frames.renderStaleAt(STEP_MS * 2);
		expect(onTick).not.toHaveBeenCalled();
		expect(onFrame).toHaveBeenCalledTimes(1);
	});

	it("start is idempotent and restarts cleanly after stop", () => {
		const { clock, onTick, onFrame } = startClock(frames);
		clock.start();
		expect(onFrame).toHaveBeenCalledTimes(1);

		frames.renderAt(STEP_MS * 2.5);
		expect(onTick).toHaveBeenCalledTimes(2);
		clock.stop();

		// Time passes while stopped; none of it is owed on restart
		frames.renderAt(5000);
		clock.start();
		expect(onTick).toHaveBeenCalledTimes(2);
		expect(onFrame).toHaveBeenLastCalledWith(0, 0);
		frames.renderAt(5000 + STEP_MS + 0.1);
		expect(onTick).toHaveBeenCalledTimes(3);
	});
});
