const native = vi.hoisted(() => ({ module: null as { isOtherAudioPlaying(): boolean } | null }));

vi.mock("expo", () => ({ requireOptionalNativeModule: () => native.module }));

async function load() {
	vi.resetModules();
	return (await import("../../infrastructure/otherAudio")).isOtherAudioPlaying;
}

describe("isOtherAudioPlaying", () => {
	it("reports what the native module sees", async () => {
		native.module = { isOtherAudioPlaying: () => true };
		expect((await load())()).toBe(true);
		native.module = { isOtherAudioPlaying: () => false };
		expect((await load())()).toBe(false);
	});

	it("reports nothing playing on a dev client built before the module", async () => {
		native.module = null;
		expect((await load())()).toBe(false);
	});

	it("reports nothing playing when the native call fails", async () => {
		native.module = {
			isOtherAudioPlaying: () => {
				throw new Error("audio session unavailable");
			},
		};
		expect((await load())()).toBe(false);
	});
});
