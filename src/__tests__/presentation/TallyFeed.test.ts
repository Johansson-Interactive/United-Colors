import type { DotView, GameEvent, RenderFrame } from "../../domain/types";
import { newCatch } from "../../presentation/effects/scoreTally";
import { feedTally } from "../../presentation/effects/tallyFeed";
import { COMBO_AMBER } from "../../presentation/theme/theme";

const PINK = "#E91E63";

const PLAYER: DotView = {
	id: "player",
	x: 120,
	y: 480,
	radius: 20,
	prevRadius: 20,
	color: PINK,
	kind: "player",
	vx: 0,
	vy: 0,
};

const frame = (over: Partial<RenderFrame> = {}): RenderFrame => ({
	phase: "RUNNING",
	score: 10,
	dots: [PLAYER],
	events: [],
	runTicks: 0,
	...over,
});

const caught = (value: number, step: number): GameEvent => ({
	type: "collect",
	value,
	step,
	sameTick: false,
});

describe("feeding the tally", () => {
	it("hands nothing on for a frame where nothing happened", () => {
		expect(feedTally(frame(), frame())).toEqual({ reset: null, catches: [], freeze: null });
	});

	it("hands each catch on from where the player was, in its pay colour", () => {
		const point: GameEvent = { type: "collectPoint", value: 5, step: 1, sameTick: false };
		const next = frame({
			score: 18,
			events: [caught(1, 1), caught(3, 2), point, { type: "spit" }],
		});
		expect(feedTally(frame(), next).catches).toEqual([
			newCatch(1, PINK, 120, 480),
			newCatch(3, COMBO_AMBER, 120, 480),
			newCatch(5, PINK, 120, 480),
		]);
	});

	it("hands the catch that ends a run on while it refuses", () => {
		const next = frame({ phase: "REJECTING", score: 11, events: [caught(1, 1)] });
		expect(feedTally(frame(), next).catches).toHaveLength(1);
	});

	it("ignores the kiosk's catches", () => {
		const kiosk = frame({ phase: "KIOSK", score: 0 });
		const next = { ...kiosk, events: [caught(1, 1)] };
		expect(feedTally(kiosk, next).catches).toEqual([]);
	});

	it("freezes the tally as the run pauses and thaws it as play resumes", () => {
		const paused = frame({ phase: "PAUSED" });
		expect(feedTally(frame(), paused).freeze).toBe(true);
		expect(feedTally(paused, paused).freeze).toBeNull();
		expect(feedTally(paused, frame()).freeze).toBe(false);
	});

	it("thaws the tally as a paused run is quit to the title, and starts it over", () => {
		const step = feedTally(frame({ phase: "PAUSED" }), frame({ phase: "KIOSK", score: 0 }));
		expect(step).toEqual({ reset: 0, catches: [], freeze: false });
	});

	it("starts the tally over as a new run starts from a game over", () => {
		const over = frame({ phase: "GAME_OVER", score: 42 });
		expect(feedTally(over, frame({ score: 0 })).reset).toBe(0);
	});

	it("starts the tally over on the title even when the score stays", () => {
		const step = feedTally(
			frame({ phase: "GAME_OVER", score: 0 }),
			frame({ phase: "KIOSK", score: 0 }),
		);
		expect(step.reset).toBe(0);
	});
});
