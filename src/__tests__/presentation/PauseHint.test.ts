import { GAME_HERTZ } from "../../domain/constants";
import {
	PAUSE_HINT_MS,
	pauseDotShown,
	pauseHintLook,
	pauseHintShown,
	RESUME_HINT,
} from "../../presentation/flow/pauseHint";
import { type GameFacts, INITIAL_FLOW, stepFlow } from "../../presentation/flow/screenFlow";

/** Run ticks for `ms` of run time */
const ticks = (ms: number) => Math.floor((ms * GAME_HERTZ) / 1000);

const GAME: GameFacts = { levelPoseSet: true, tiltPresent: true, playerColor: "#E91E63" };

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

describe("the pause hint around a finger on the field", () => {
	const young = ticks(1000);
	const running = { ...INITIAL_FLOW, phase: "RUNNING" as const };

	it("is gone the moment a finger lands, with no fade over the opening portal", () => {
		const touched = stepFlow(running, { type: "fieldTouched" }, GAME);
		expect(pauseHintLook(touched.screen.kind, young, true)).toEqual({ opacity: 0, over: 0 });
	});

	it("comes back after an early lift while the run is still young", () => {
		const touched = stepFlow(running, { type: "fieldTouched" }, GAME).state;
		const paused = stepFlow(touched, { type: "phaseChanged", phase: "PAUSED" }, GAME).state;
		const cleared = stepFlow(paused, { type: "bloomCleared" }, GAME).state;
		const resumed = stepFlow(cleared, { type: "phaseChanged", phase: "RUNNING" }, GAME);
		expect(resumed.screen.kind).toBe("hud");
		expect(pauseHintLook(resumed.screen.kind, young, true).opacity).toBe(1);
	});

	it("still fades in, and fades out as the run grows old, as it always has", () => {
		const shown = pauseHintLook("hud", young, true);
		expect(shown.opacity).toBe(1);
		expect(shown.over).toBeGreaterThan(0);
		const aged = pauseHintLook("hud", ticks(PAUSE_HINT_MS), true);
		expect(aged.opacity).toBe(0);
		expect(aged.over).toBeGreaterThan(0);
	});
});

describe("dev pause dot", () => {
	it("shows on the HUD only where touch steers the dot, so the field can't pause", () => {
		expect(pauseDotShown("hud", false)).toBe(true);
		expect(pauseDotShown("hud", true)).toBe(false);
	});

	it("goes as the bloom starts, so it never floats over the pause world growing from the seat", () => {
		expect(pauseDotShown("frosting", false)).toBe(false);
	});

	it("is not on any other screen", () => {
		for (const screen of ["title", "pause", "getReady", "gameOver"] as const) {
			expect(pauseDotShown(screen, false)).toBe(false);
		}
	});
});
