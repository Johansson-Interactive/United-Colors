import { hasPauseWorld, stageLook } from "../../presentation/effects/stageLook";
import {
	type FlowEvent,
	type GameFacts,
	INITIAL_FLOW,
	stepFlow,
} from "../../presentation/flow/screenFlow";

const PINK = "#E91E63";

describe("the stage look", () => {
	it("shows the stage on the title, its edges washed in ink over a clear field", () => {
		const look = stageLook({ screen: { kind: "title" }, phase: "KIOSK" });
		expect(look.accent).toBe("ink");
		expect(look.frost.to).toBe(0);
		expect(look.opacity.to).toBe(1);
	});

	it("draws the frosted pause world under the pause's content, with play hidden over it", () => {
		const look = stageLook({ screen: { kind: "pause" }, phase: "PAUSED" });
		expect(look.playShows).toBe("none");
		expect(hasPauseWorld(look.playShows)).toBe(true);
	});

	it("keeps the play side sharp over the pause world: the frost is the pause world's", () => {
		for (const screen of [
			{ kind: "frosting", start: "finger" },
			{ kind: "pause" },
			{ kind: "getReady" },
		] as const) {
			expect(stageLook({ screen, phase: "PAUSED" }).frost.to).toBe(0);
		}
	});

	it("draws the pause world under the bloom and shows play through its portal", () => {
		for (const phase of ["RUNNING", "PAUSED"] as const) {
			const look = stageLook({ screen: { kind: "frosting", start: "finger" }, phase });
			expect(look.playShows).toBe("portal");
			expect(look.accent).toBe("player");
		}
	});

	it("draws the pause world around Get ready and shows play through its portal", () => {
		const look = stageLook({ screen: { kind: "getReady" }, phase: "PAUSED" });
		expect(look.playShows).toBe("portal");
	});

	it("keeps the pause world, frosted, under the bowl and the speed view opened from the pause", () => {
		const pause = stageLook({ screen: { kind: "pause" }, phase: "PAUSED" });
		for (const screen of [
			{ kind: "settle", color: PINK },
			{ kind: "speed", color: PINK },
		] as const) {
			const look = stageLook({ screen, phase: "PAUSED" });
			expect(look.opacity.to).toBe(1);
			expect(look).toEqual(pause);
		}
	});

	it("goes straight to the pause with no portal when the player leaves the app mid-run", () => {
		// Leaving the app takes the flow from play straight to the pause screen (see screenFlow.ts)
		const look = stageLook({ screen: { kind: "pause" }, phase: "PAUSED" });
		expect(look.playShows).toBe("none");
		expect(look.frost.over).toEqual({ kind: "instant" });
	});

	it("draws no pause world in play, and play shows all over, so play costs nothing extra", () => {
		const look = stageLook({ screen: { kind: "hud" }, phase: "RUNNING" });
		expect(look.playShows).toBe("all");
		expect(hasPauseWorld(look.playShows)).toBe(false);
		expect(look.frost.to).toBe(0);
		expect(look.accent).toBe("player");
	});

	it("draws no pause world on the title or under the bowl and the speed view opened from it", () => {
		for (const screen of [
			{ kind: "title" },
			{ kind: "settle", color: PINK },
			{ kind: "speed", color: PINK },
		] as const) {
			const look = stageLook({ screen, phase: "KIOSK" });
			expect(look.playShows).toBe("all");
		}
	});

	it("shows the HUD's score on the play side in play and through either portal, so a portal covers and uncovers it", () => {
		expect(stageLook({ screen: { kind: "hud" }, phase: "RUNNING" }).hudScore).toBe(true);
		expect(
			stageLook({ screen: { kind: "frosting", start: "finger" }, phase: "PAUSED" }).hudScore,
		).toBe(true);
		expect(stageLook({ screen: { kind: "getReady" }, phase: "PAUSED" }).hudScore).toBe(true);
	});

	it("hides the HUD's score where no play side shows it", () => {
		expect(stageLook({ screen: { kind: "pause" }, phase: "PAUSED" }).hudScore).toBe(false);
		expect(stageLook({ screen: { kind: "title" }, phase: "KIOSK" }).hudScore).toBe(false);
		expect(stageLook({ screen: { kind: "gameOver" }, phase: "GAME_OVER" }).hudScore).toBe(false);
	});

	it("dims the field to 0.6 a moment after the run ends, so the game over reads over a quieted field", () => {
		const look = stageLook({ screen: { kind: "gameOver" }, phase: "GAME_OVER" });
		expect(look.frost).toEqual({ to: 0.6, over: { kind: "timed", duration: 700, delay: 350 } });
		expect(look.playShows).toBe("all");
	});

	it("clears the field's dim in 300 ms as the game over gives way to the title", () => {
		const look = stageLook({ screen: { kind: "title" }, phase: "KIOSK" });
		expect(look.frost).toEqual({ to: 0, over: { kind: "timed", duration: 300 } });
	});

	it("fades the stage out in 300 ms under the bowl and the speed view opened from the title", () => {
		for (const screen of [
			{ kind: "settle", color: PINK },
			{ kind: "speed", color: PINK },
		] as const) {
			const look = stageLook({ screen, phase: "KIOSK" });
			expect(look.opacity).toEqual({ to: 0, over: { kind: "timed", duration: 300 } });
		}
	});

	it("fades the stage back in over 400 ms as the bowl or the speed view opened from the title closes", () => {
		for (const [open, close] of [
			[{ type: "startPressed", color: PINK, at: { x: 0, y: 0 } }, { type: "settleBacked" }],
			[{ type: "levelPressed", from: "menu", color: PINK }, { type: "settleBacked" }],
			[{ type: "speedPressed", from: "menu", color: PINK }, { type: "speedBacked" }],
		] satisfies [FlowEvent, FlowEvent][]) {
			expect(walk([open, close])).toEqual([
				{ screen: open.type === "speedPressed" ? "speed" : "settle", opacity: FADED_OUT },
				{ screen: "title", opacity: FADING_IN },
			]);
		}
	});

	it("follows the title's fade-in with an instant show as a run started from the bowl reaches the hud", () => {
		// The flood covers the bowl and the flow drops back to the title before the run starts,
		// so the hud's look comes after the title's fade-in and shows the stage at once
		expect(
			walk([
				{ type: "startPressed", color: PINK, at: { x: 0, y: 0 } },
				{ type: "settled", pose: { x: 0, y: 0, z: -1 }, side: "up", at: { x: 0, y: 0 } },
				{ type: "covered" },
				{ type: "phaseChanged", phase: "RUNNING" },
			]),
		).toEqual([
			{ screen: "settle", opacity: FADED_OUT },
			{ screen: "settle", opacity: FADED_OUT },
			{ screen: "title", opacity: FADING_IN },
			{ screen: "hud", opacity: { to: 1, over: { kind: "instant" } } },
		]);
	});
});

const FADED_OUT = { to: 0, over: { kind: "timed", duration: 300 } };
const FADING_IN = { to: 1, over: { kind: "timed", duration: 400 } };

/** A first game: no level pose yet, so PLAY on the title opens the bowl */
const GAME: GameFacts = { levelPoseSet: false, tiltPresent: true, playerColor: PINK };

/** Steps the real flow from the title through `events`, with the stage opacity after each */
function walk(events: FlowEvent[]) {
	let flow = INITIAL_FLOW;
	return events.map((event) => {
		const { state, screen } = stepFlow(flow, event, GAME);
		flow = state;
		return {
			screen: screen.kind,
			opacity: stageLook({ screen, phase: state.phase }).opacity,
		};
	});
}
