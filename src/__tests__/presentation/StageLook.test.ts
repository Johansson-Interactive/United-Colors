import { type FlowEvent, INITIAL_FLOW, stepFlow } from "../../presentation/flow/screenFlow";
import { stageLook } from "../../presentation/flow/stageLook";
import { INK_LIFT } from "../../presentation/theme/theme";

const PINK = "#E91E63";

describe("the stage look", () => {
	it("shows the stage on the title, its edges washed in ink over a clear field", () => {
		const look = stageLook({ screen: { kind: "title" }, phase: "KIOSK", playerColor: PINK });
		expect(look.accent.to).toBe(INK_LIFT);
		expect(look.frost.to).toBe(0);
		expect(look.opacity.to).toBe(1);
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

	it("keeps the stage showing, frosted, under the bowl and the speed view opened from the pause", () => {
		const pause = stageLook({ screen: { kind: "pause" }, phase: "PAUSED", playerColor: PINK });
		for (const screen of [
			{ kind: "settle", color: PINK },
			{ kind: "speed", color: PINK },
		] as const) {
			const look = stageLook({ screen, phase: "PAUSED", playerColor: PINK });
			expect(look.frost.to).toBe(1);
			expect(look.opacity.to).toBe(1);
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

	it("fades the stage out in 300 ms under the bowl and the speed view opened from the title", () => {
		for (const screen of [
			{ kind: "settle", color: PINK },
			{ kind: "speed", color: PINK },
		] as const) {
			const look = stageLook({ screen, phase: "KIOSK", playerColor: PINK });
			expect(look.opacity).toEqual({ to: 0, over: { kind: "timed", duration: 300, delay: 0 } });
		}
	});

	it("fades the stage back in over 400 ms as the bowl or the speed view closes to the title", () => {
		const look = stageLook({ screen: { kind: "title" }, phase: "KIOSK", playerColor: PINK });
		expect(look.opacity).toEqual({ to: 1, over: { kind: "timed", duration: 400, delay: 0 } });
	});

	it("shows the stage at once as a run started from the bowl comes out from under its flood", () => {
		// The flood covers the bowl, the flow drops back to the title, and only then does the run
		// start; the run's show has to land after the title's fade-in, so the stage is up at once
		const events: FlowEvent[] = [
			{ type: "startPressed", color: PINK, hasZero: false, at: { x: 0, y: 0 } },
			{ type: "settled", zero: { x: 0, y: 0 }, facingDown: false, at: { x: 0, y: 0 } },
			{ type: "covered" },
			{ type: "phaseChanged", phase: "RUNNING" },
		];
		let flow = INITIAL_FLOW;
		const looks = events.map((event) => {
			const { state, screen } = stepFlow(flow, event);
			flow = state;
			return {
				screen: screen.kind,
				...stageLook({ screen, phase: state.phase, playerColor: PINK }),
			};
		});
		expect(looks.map((l) => l.screen)).toEqual(["settle", "settle", "title", "hud"]);
		expect(looks[0].opacity.to).toBe(0);
		expect(looks[3].opacity).toEqual({ to: 1, over: { kind: "instant" } });
	});
});
