import { stageLook } from "../../presentation/flow/stageLook";
import { INK_LIFT } from "../../presentation/theme/theme";

const PINK = "#E91E63";

describe("the stage look", () => {
	it("washes the title's edges in ink over a clear field", () => {
		const look = stageLook({ screen: { kind: "title" }, phase: "KIOSK", playerColor: PINK });
		expect(look.accent.to).toBe(INK_LIFT);
		expect(look.frost.to).toBe(0);
	});

	it("frosts the field over the pause in 450 ms, all over, with no window left from an earlier Get ready", () => {
		const look = stageLook({ screen: { kind: "pause" }, phase: "PAUSED", playerColor: PINK });
		expect(look.frost).toEqual({ to: 1, over: { kind: "timed", duration: 450, delay: 0 } });
		expect(look.shutWindow).toBe(true);
	});

	it("dims the field to 0.6 a moment after the run ends, so the game over reads over a quieted field", () => {
		const look = stageLook({ screen: { kind: "gameOver" }, phase: "GAME_OVER", playerColor: PINK });
		expect(look.frost).toEqual({ to: 0.6, over: { kind: "timed", duration: 700, delay: 350 } });
	});

	it("keeps the field frosted under the bowl and the speed view opened from the pause", () => {
		const pause = stageLook({ screen: { kind: "pause" }, phase: "PAUSED", playerColor: PINK });
		for (const screen of [
			{ kind: "settle", color: PINK },
			{ kind: "speed", color: PINK },
		] as const) {
			const look = stageLook({ screen, phase: "PAUSED", playerColor: PINK });
			expect(look.frost.to).toBe(1);
			expect(look).toEqual(pause);
		}
	});

	it("keeps Get ready frosted as the pause is, so opening it leaves its window to Get ready", () => {
		const pause = stageLook({ screen: { kind: "pause" }, phase: "PAUSED", playerColor: PINK });
		const look = stageLook({ screen: { kind: "getReady" }, phase: "PAUSED", playerColor: PINK });
		expect(look.frost.to).toBe(1);
		expect(look).toEqual(pause);
	});

	it("clears the field in 300 ms as play starts or resumes, with the edges in the player's colour", () => {
		const look = stageLook({ screen: { kind: "hud" }, phase: "RUNNING", playerColor: PINK });
		expect(look.frost).toEqual({ to: 0, over: { kind: "timed", duration: 300, delay: 0 } });
		expect(look.accent).toEqual({ to: PINK, over: { kind: "instant" } });
		expect(look.shutWindow).toBe(false);
	});
});
