const native = vi.hoisted(() => ({
	module: null as { setFastest(fastest: boolean): Promise<void> } | null,
}));

vi.mock("expo", () => ({ requireOptionalNativeModule: () => native.module }));

async function load() {
	vi.resetModules();
	return await import("../../infrastructure/DisplayRateService");
}

describe("DisplayRateService", () => {
	it("asks the display for its fastest rate and lets it go", async () => {
		const setFastest = vi.fn(async (_fastest: boolean) => {});
		native.module = { setFastest };
		const { DisplayRateService } = await load();
		const display = new DisplayRateService();
		display.setFastest(true);
		display.setFastest(false);
		expect(setFastest.mock.calls).toEqual([[true], [false]]);
	});

	it("does nothing without the module (iOS) and swallows a failed call", async () => {
		native.module = null;
		const missing = await load();
		expect(() => new missing.DisplayRateService().setFastest(true)).not.toThrow();

		// An unhandled rejection would fail the run
		const setFastest = vi.fn(async (): Promise<void> => {
			throw new Error("no window");
		});
		native.module = { setFastest };
		const failing = await load();
		new failing.DisplayRateService().setFastest(true);
		await Promise.resolve();
		expect(setFastest).toHaveBeenCalledOnce();
	});
});
