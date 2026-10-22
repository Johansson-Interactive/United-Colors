import { GAME_HERTZ } from "../../domain/constants";
import { PAUSE_HINT_MS, pauseHintShown, RESUME_HINT } from "../../presentation/flow/pauseHint";

/** Run ticks for `ms` of run time */
const ticks = (ms: number) => Math.floor((ms * GAME_HERTZ) / 1000);

describe("pause hint", () => {
	it("shows over the HUD for the first few seconds of a run, then goes", () => {
		expect(pauseHintShown("hud", 0, true)).toBe(true);
		expect(pauseHintShown("hud", ticks(PAUSE_HINT_MS - 100), true)).toBe(true);
		expect(pauseHintShown("hud", ticks(PAUSE_HINT_MS), true)).toBe(false);
	});

	it("does not come back when a run is resumed after its first few seconds", () => {
		expect(pauseHintShown("hud", ticks(PAUSE_HINT_MS * 3), true)).toBe(false);
	});

	it("shows only over the HUD, not while the field frosts or on any other screen", () => {
		for (const screen of ["frosting", "pause", "getReady", "title", "gameOver"] as const) {
			expect(pauseHintShown(screen, 0, true)).toBe(false);
		}
	});

	it("does not show where a touch on the field does not pause", () => {
		expect(pauseHintShown("hud", 0, false)).toBe(false);
	});

	it("tells the paused player to hold, since a tap on the frost does not resume", () => {
		expect(RESUME_HINT).toMatch(/\bhold\b/);
	});
});
