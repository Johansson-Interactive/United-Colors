const native = vi.hoisted(() => ({
	module: null as { getCornerRadius(): Promise<number | null> } | null,
}));

vi.mock("expo", () => ({ requireOptionalNativeModule: () => native.module }));

async function load() {
	vi.resetModules();
	return await import("../../infrastructure/displayCorners");
}

describe("loadDisplayCorners", () => {
	it("rounds with the radius the platform reports, the platform's way", async () => {
		native.module = { getCornerRadius: async () => 55 };
		const { loadDisplayCorners } = await load();
		expect(await loadDisplayCorners("ios")).toEqual({ radius: 55, curve: "continuous" });
		expect(await loadDisplayCorners("android")).toEqual({ radius: 55, curve: "circular" });
	});

	it("keeps a square screen square", async () => {
		native.module = { getCornerRadius: async () => 0 };
		const { loadDisplayCorners } = await load();
		expect(await loadDisplayCorners("ios")).toEqual({ radius: 0, curve: "continuous" });
	});

	it("keeps the corners square when the platform can't say, the module is missing or the call fails", async () => {
		for (const module of [
			{ getCornerRadius: async () => null },
			null,
			{
				getCornerRadius: async () => {
					throw new Error("no screen");
				},
			},
		]) {
			native.module = module;
			const { loadDisplayCorners } = await load();
			expect(await loadDisplayCorners("android")).toEqual({ radius: 0, curve: "circular" });
		}
	});
});
