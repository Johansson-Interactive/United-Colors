import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeoutGroup } from "../../presentation/hooks/timeoutGroup";

describe("createTimeoutGroup", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs each scheduled callback after its delay and forgets it", () => {
		const group = createTimeoutGroup();
		const fn = vi.fn();
		group.schedule(fn, 100);
		expect(group.size).toBe(1);

		vi.advanceTimersByTime(99);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(group.size).toBe(0);
	});

	it("clearAll cancels every pending callback, as on unmount", () => {
		const group = createTimeoutGroup();
		const a = vi.fn();
		const b = vi.fn();
		group.schedule(a, 100);
		group.schedule(b, 200);

		group.clearAll();
		vi.advanceTimersByTime(1000);

		expect(a).not.toHaveBeenCalled();
		expect(b).not.toHaveBeenCalled();
		expect(group.size).toBe(0);
	});

	it("clearAll leaves already-fired callbacks alone and cancels the rest", () => {
		const group = createTimeoutGroup();
		const early = vi.fn();
		const late = vi.fn();
		group.schedule(early, 50);
		group.schedule(late, 500);

		vi.advanceTimersByTime(50);
		group.clearAll();
		vi.advanceTimersByTime(1000);

		expect(early).toHaveBeenCalledTimes(1);
		expect(late).not.toHaveBeenCalled();
	});
});
