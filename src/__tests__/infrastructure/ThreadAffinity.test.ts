const native = vi.hoisted(() => ({
	module: null as { pinMainThreadToFastCores(): Promise<number[]> } | null,
}));

vi.mock("expo", () => ({ requireOptionalNativeModule: () => native.module }));

async function load() {
	vi.resetModules();
	return await import("../../infrastructure/threadAffinity");
}

describe("pinMainThreadToFastCores", () => {
	it("pins Android's main thread and reports the cores", async () => {
		const pin = vi.fn(async () => [4, 5, 6, 7]);
		native.module = { pinMainThreadToFastCores: pin };
		const { pinMainThreadToFastCores } = await load();
		expect(await pinMainThreadToFastCores("android")).toEqual([4, 5, 6, 7]);
		expect(pin).toHaveBeenCalledOnce();
	});

	it("leaves iOS alone", async () => {
		const pin = vi.fn(async () => [4, 5, 6, 7]);
		native.module = { pinMainThreadToFastCores: pin };
		const { pinMainThreadToFastCores } = await load();
		expect(await pinMainThreadToFastCores("ios")).toEqual([]);
		expect(pin).not.toHaveBeenCalled();
	});

	it("reports no cores when the module is missing, declines or fails", async () => {
		for (const module of [
			null,
			{ pinMainThreadToFastCores: async () => [] },
			{
				pinMainThreadToFastCores: async () => {
					throw new Error("EPERM");
				},
			},
		]) {
			native.module = module;
			const { pinMainThreadToFastCores } = await load();
			expect(await pinMainThreadToFastCores("android")).toEqual([]);
		}
	});
});
