import {
	type FlowState,
	INITIAL_FLOW,
	kioskQuiet,
	stepFlow,
} from "../../presentation/flow/screenFlow";
import { INK_LIFT } from "../../presentation/theme/theme";

const AT = { x: 10, y: 20 };
const ZERO = { x: 0.3, y: -0.1 };
const PINK = "#E91E63";
const BLUE = "#2196F3";

const open = (from: "start" | "pause" | "menu", color = PINK): FlowState => ({
	settle: { from, color },
	speed: null,
});

describe("screen flow", () => {
	it("a first PLAY opens the settle bowl in the play dot's colour instead of playing", () => {
		const step = stepFlow(INITIAL_FLOW, {
			type: "startPressed",
			color: PINK,
			hasZero: false,
			at: AT,
		});
		expect(step.state).toEqual(open("start"));
		expect(step.flood).toBeUndefined();
		expect(step.calibrate).toBeUndefined();
	});

	it("with a level pose set, PLAY floods straight into a game in that colour", () => {
		const step = stepFlow(INITIAL_FLOW, {
			type: "startPressed",
			color: BLUE,
			hasZero: true,
			at: AT,
		});
		expect(step.state).toBe(INITIAL_FLOW);
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "play", color: BLUE } });
	});

	it("the level button opens the bowl from the title or the pause", () => {
		expect(
			stepFlow(INITIAL_FLOW, { type: "levelPressed", from: "menu", color: BLUE }).state,
		).toEqual(open("menu", BLUE));
		expect(
			stepFlow(INITIAL_FLOW, { type: "levelPressed", from: "pause", color: PINK }).state,
		).toEqual(open("pause"));
	});

	it("settling for a first game saves the pose and floods from the bowl into play", () => {
		const step = stepFlow(open("start"), {
			type: "settled",
			zero: ZERO,
			facingDown: false,
			at: AT,
		});
		expect(step.calibrate).toEqual({ zero: ZERO, facingDown: false });
		expect(step.flood).toEqual({ color: PINK, at: AT, action: { kind: "play", color: PINK } });
		// The bowl stays under the flood until it has covered the screen
		expect(step.state.settle).toEqual({ from: "start", color: PINK });
		expect(stepFlow(step.state, { type: "covered" }).state).toEqual(INITIAL_FLOW);
	});

	it("settling from the pause saves the pose for the side faced and floods into the resume", () => {
		const step = stepFlow(open("pause", BLUE), {
			type: "settled",
			zero: ZERO,
			facingDown: true,
			at: AT,
		});
		expect(step.calibrate).toEqual({ zero: ZERO, facingDown: true });
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "resume" } });
		expect(step.state.settle).not.toBeNull();
	});

	it("settling from the title only saves the pose; the title comes straight back", () => {
		const step = stepFlow(open("menu"), { type: "settled", zero: ZERO, facingDown: false, at: AT });
		expect(step.calibrate).toEqual({ zero: ZERO, facingDown: false });
		expect(step.flood).toBeUndefined();
		expect(step.state).toEqual(INITIAL_FLOW);
	});

	it("a settle with no bowl open does nothing", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "settled", zero: ZERO, facingDown: false, at: AT });
		expect(step).toEqual({ state: INITIAL_FLOW });
	});

	it("backing out of the bowl closes it without saving", () => {
		const step = stepFlow(open("start"), { type: "settleBacked" });
		expect(step).toEqual({ state: INITIAL_FLOW });
	});

	it("RETRY floods into a new game in the player's colour", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "retryPressed", color: BLUE, at: AT });
		expect(step.flood).toEqual({ color: BLUE, at: AT, action: { kind: "play", color: BLUE } });
	});

	it("QUIT and BACK flood in ink to the title", () => {
		const step = stepFlow(INITIAL_FLOW, { type: "leavePressed", at: AT });
		expect(step.flood).toEqual({ color: INK_LIFT, at: AT, action: { kind: "kiosk" } });
	});

	it("the kiosk is quiet while the bowl is open over the title, not over the pause", () => {
		expect(kioskQuiet(INITIAL_FLOW)).toBe(false);
		expect(kioskQuiet(open("start"))).toBe(true);
		expect(kioskQuiet(open("menu"))).toBe(true);
		expect(kioskQuiet(open("pause"))).toBe(false);
	});

	it("the speed button opens the speed view in the player's colour, and BACK closes it", () => {
		const opened = stepFlow(INITIAL_FLOW, { type: "speedPressed", color: BLUE });
		expect(opened).toEqual({ state: { settle: null, speed: { color: BLUE } } });
		expect(stepFlow(opened.state, { type: "speedBacked" })).toEqual({ state: INITIAL_FLOW });
	});

	it("the speed view saves nothing and starts no flood, and leaves the kiosk alone", () => {
		const opened = stepFlow(INITIAL_FLOW, { type: "speedPressed", color: PINK });
		expect(opened.calibrate).toBeUndefined();
		expect(opened.flood).toBeUndefined();
		expect(kioskQuiet(opened.state)).toBe(false);
	});

	it("a flood covering the screen closes the speed view too", () => {
		const opened = stepFlow(INITIAL_FLOW, { type: "speedPressed", color: PINK }).state;
		expect(stepFlow(opened, { type: "covered" }).state).toEqual(INITIAL_FLOW);
	});
});
