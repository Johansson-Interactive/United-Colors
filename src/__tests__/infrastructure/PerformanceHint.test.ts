const native = vi.hoisted(() => ({
	module: null as { start(share: number): Promise<boolean> } | null,
}));

vi.mock("expo", () => ({ requireOptionalNativeModule: () => native.module }));

async function load() {
	vi.resetModules();
	return await import("../../infrastructure/performanceHint");
}

describe("startPerformanceHint", () => {
	it("asks Android to fit the frame work in half the frame", async () => {
		const start = vi.fn(async () => true);
		native.module = { start };
		const { startPerformanceHint, FRAME_WORK_SHARE } = await load();
		expect(await startPerformanceHint("android")).toBe(true);
		expect(start).toHaveBeenCalledWith(FRAME_WORK_SHARE);
		expect(FRAME_WORK_SHARE).toBe(0.5);
	});

	it("leaves iOS alone", async () => {
		const start = vi.fn(async () => true);
		native.module = { start };
		const { startPerformanceHint } = await load();
		expect(await startPerformanceHint("ios")).toBe(false);
		expect(start).not.toHaveBeenCalled();
	});

	it("reports off when Android has no hint sessions, the module is missing or the call fails", async () => {
		for (const module of [
			{ start: async () => false },
			null,
			{
				start: async () => {
					throw new Error("no session");
				},
			},
		]) {
			native.module = module;
			const { startPerformanceHint } = await load();
			expect(await startPerformanceHint("android")).toBe(false);
		}
	});
});
