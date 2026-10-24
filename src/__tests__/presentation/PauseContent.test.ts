import { pauseContent, pauseEntryFades } from "../../presentation/flow/pauseContent";
import type { Screen } from "../../presentation/flow/screenFlow";

describe("pause content", () => {
	it("is there and pressable on the pause", () => {
		expect(pauseContent("pause")).toBe("pressable");
	});

	it("is there but takes no press while the bloom grows over the run", () => {
		expect(pauseContent("frosting")).toBe("inert");
	});

	it("is there but takes no press while a finger holds Get ready open", () => {
		expect(pauseContent("getReady")).toBe("inert");
	});

	it("is not there on any other screen", () => {
		const others: Screen["kind"][] = ["title", "hud", "speed", "gameOver"];
		for (const screen of others) expect(pauseContent(screen)).toBeNull();
	});
});

describe("pause content's entry", () => {
	it("doesn't fade in when it first shows under the bloom, where the portal reveals it in place", () => {
		expect(pauseEntryFades("inert")).toBe(false);
	});

	it("fades in where it comes straight onto the pause: back from the bowl, the speed view or leaving the app", () => {
		expect(pauseEntryFades("pressable")).toBe(true);
	});
});
