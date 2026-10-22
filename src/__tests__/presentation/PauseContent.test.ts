import { pauseContent, pauseEntryFades } from "../../presentation/flow/pauseContent";
import type { Screen } from "../../presentation/flow/screenFlow";

describe("pause content", () => {
	it("is there and pressable on the pause", () => {
		expect(pauseContent("pause")).toEqual({ pressable: true });
	});

	it("is there but takes no press while the bloom grows over the run", () => {
		expect(pauseContent("frosting")).toEqual({ pressable: false });
	});

	it("is there but takes no press while a finger holds Get ready open", () => {
		expect(pauseContent("getReady")).toEqual({ pressable: false });
	});

	it("is not there on any other screen", () => {
		const others: Screen["kind"][] = ["title", "hud", "speed", "settle", "gameOver"];
		for (const screen of others) expect(pauseContent(screen)).toBeNull();
	});
});

describe("pause content's entry", () => {
	it("doesn't fade in when the bloom's portal reveals it, as it is simply there", () => {
		expect(pauseEntryFades("hud", "frosting")).toBe(false);
	});

	it("doesn't fade in when the player comes back from leaving the app mid-run", () => {
		expect(pauseEntryFades("hud", "pause")).toBe(false);
	});

	it("fades in as today when it first shows on the pause itself, back from the bowl or the speed view", () => {
		expect(pauseEntryFades("settle", "pause")).toBe(true);
		expect(pauseEntryFades("speed", "pause")).toBe(true);
	});
});
