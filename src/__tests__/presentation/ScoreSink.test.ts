import { layoutDotMatrix } from "../../presentation/dotmatrix/layout";
import {
	FADE_IN_MS,
	FADE_OUT_MS,
	MIDDLE_PITCH,
	middlePitch,
	middleSpot,
	RISE_MS,
	type ScoreScreen,
	SINK_MS,
	scoreMotion,
	scorePose,
	scoreSpot,
	sinkPlan,
	TIME_GAP,
	TIME_PITCH,
	TIME_REVEAL_MS,
	WAIT_OPACITY,
} from "../../presentation/effects/scoreSink";
import { SCORE_CENTRE_Y, SCORE_PITCH } from "../../presentation/effects/scoreTally";

const STAGE = { width: 390, height: 800 };
const SCREENS: ScoreScreen[] = [
	"title",
	"hud",
	"frosting",
	"pause",
	"speed",
	"getReady",
	"settle",
	"gameOver",
];

describe("where the paused score stands", () => {
	it("is the middle on the pause, the top in Get ready, and nowhere else", () => {
		expect(scoreSpot("pause")).toBe("middle");
		expect(scoreSpot("getReady")).toBe("top");
		for (const screen of ["title", "hud", "frosting", "speed", "settle", "gameOver"] as const) {
			expect(scoreSpot(screen), screen).toBeNull();
		}
	});
});

describe("what the paused score does as the screen changes", () => {
	it("sinks as the pause opens from play, through the bloom or not, and again when Get ready closes back to it", () => {
		expect(scoreMotion("hud", "pause")).toBe("sink");
		expect(scoreMotion("frosting", "pause")).toBe("sink");
		expect(scoreMotion("getReady", "pause")).toBe("sink");
	});

	it("rises as Get ready opens from the pause", () => {
		expect(scoreMotion("pause", "getReady")).toBe("rise");
	});

	it("hands off to the HUD's meter the instant Get ready resumes play", () => {
		expect(scoreMotion("getReady", "hud")).toBe("handOff");
	});

	it("fades with the pause's chrome for the speed view, the settle bowl and QUIT", () => {
		expect(scoreMotion("pause", "speed")).toBe("fadeOut");
		expect(scoreMotion("pause", "settle")).toBe("fadeOut");
		expect(scoreMotion("pause", "title")).toBe("fadeOut");
		expect(scoreMotion("speed", "pause")).toBe("fadeIn");
		expect(scoreMotion("settle", "pause")).toBe("fadeIn");
	});

	it("fades in where the pause is the first screen it sees", () => {
		expect(scoreMotion(null, "pause")).toBe("fadeIn");
	});

	it("does nothing between screens where it has no place", () => {
		for (const from of SCREENS) {
			for (const to of SCREENS) {
				if (scoreSpot(from) === null && scoreSpot(to) === null) {
					expect(scoreMotion(from, to), `${from} to ${to}`).toBe("none");
				}
			}
		}
	});
});

describe("the paused score's place", () => {
	it("is set at the middle pitch, closer only for a score too wide for the stage", () => {
		expect(middlePitch(47, STAGE.width)).toBe(MIDDLE_PITCH);
		expect(middlePitch(0, STAGE.width)).toBe(MIDDLE_PITCH);
		const wide = 1234567;
		const pitch = middlePitch(wide, STAGE.width);
		expect(pitch).toBeLessThan(MIDDLE_PITCH);
		expect(layoutDotMatrix(String(wide)).cols * pitch).toBeLessThanOrEqual(STAGE.width);
	});

	it("centres the score and the time, as a pair, on the stage", () => {
		const { scoreY, timeY } = middleSpot(STAGE.height, MIDDLE_PITCH);
		const scoreTop = scoreY - (7 * MIDDLE_PITCH) / 2;
		const timeBottom = timeY + (7 * TIME_PITCH) / 2;
		expect(scoreTop + timeBottom).toBeCloseTo(STAGE.height, 9);
		expect(timeY - (7 * TIME_PITCH) / 2 - (scoreY + (7 * MIDDLE_PITCH) / 2)).toBe(TIME_GAP);
	});

	it("at the top is the HUD's total exactly: its centre line and its pitch, dimmed", () => {
		const top = scorePose("top", STAGE.height, MIDDLE_PITCH);
		expect(top.y).toBe(SCORE_CENTRE_Y);
		expect(top.scale * MIDDLE_PITCH).toBeCloseTo(SCORE_PITCH, 9);
		expect(top.opacity).toBe(WAIT_OPACITY);
	});

	it("in the middle is full size and fully there", () => {
		const middle = scorePose("middle", STAGE.height, MIDDLE_PITCH);
		expect(middle).toEqual({
			y: middleSpot(STAGE.height, MIDDLE_PITCH).scoreY,
			scale: 1,
			opacity: 1,
		});
	});
});

describe("the plans", () => {
	const top = scorePose("top", STAGE.height, MIDDLE_PITCH);
	const middle = scorePose("middle", STAGE.height, MIDDLE_PITCH);

	it("a sink carries the HUD's bright total down into the middle, the time popping in as it lands", () => {
		expect(sinkPlan("sink", STAGE.height, MIDDLE_PITCH)).toEqual({
			from: { ...top, opacity: 1 },
			to: middle,
			ms: SINK_MS,
			time: { reveal: true, opacity: 1, delayMs: SINK_MS, ms: TIME_REVEAL_MS },
		});
	});

	it("a rise takes the score back up to wait dimmed, the time fading where it stands", () => {
		expect(sinkPlan("rise", STAGE.height, MIDDLE_PITCH)).toEqual({
			from: middle,
			to: top,
			ms: RISE_MS,
			time: { reveal: false, opacity: 0, delayMs: 0, ms: FADE_OUT_MS },
		});
	});

	it("the fades keep the score in the middle, at the chrome's own times", () => {
		expect(sinkPlan("fadeIn", STAGE.height, MIDDLE_PITCH)).toEqual({
			from: { ...middle, opacity: 0 },
			to: middle,
			ms: FADE_IN_MS,
			time: { reveal: false, opacity: 1, delayMs: 0, ms: FADE_IN_MS },
		});
		expect(sinkPlan("fadeOut", STAGE.height, MIDDLE_PITCH)).toEqual({
			from: middle,
			to: { ...middle, opacity: 0 },
			ms: FADE_OUT_MS,
			time: { reveal: false, opacity: 0, delayMs: 0, ms: FADE_OUT_MS },
		});
	});

	it("a hand-off and none have nothing to play", () => {
		expect(sinkPlan("handOff", STAGE.height, MIDDLE_PITCH)).toBeNull();
		expect(sinkPlan("none", STAGE.height, MIDDLE_PITCH)).toBeNull();
	});
});
