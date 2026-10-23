import { GameSession } from "../../application/GameSession";
import { createGameStore } from "../../application/GameStore";
import { createPilot, pilotStep } from "../../application/pilot";
import type { Clock } from "../../application/ports";
import { FLAT, gravityTilt } from "../../domain/levelPose";
import { seededRandom } from "../../domain/random";
import type { DotView, RenderFrame, TiltAngles } from "../../domain/types";

const SCREEN = { width: 402, height: 874 };
const PINK = "#E91E63";
const BLUE = "#2196F3";
const LEVEL: TiltAngles = { x: 0, y: 0 };

function dot(partial: Partial<DotView> & Pick<DotView, "kind" | "x" | "y" | "color">): DotView {
	return { id: "d", radius: 20, prevRadius: 20, vx: 0, vy: 0, ...partial };
}

function running(dots: DotView[]): RenderFrame {
	return { phase: "RUNNING", score: 0, dots, events: [], runTicks: 0 };
}

const player = dot({ kind: "player", x: 201, y: 437, color: PINK, radius: 25 });

/** A clock the test steps by hand: each step is one tick and one rendered frame */
function manualClock() {
	let tick: () => void = () => {};
	let frame: (dtMs: number, alpha: number) => void = () => {};
	const clock: Clock = { start: () => {}, stop: () => {} };
	return {
		createClock: (onTick: () => void, onFrame?: (dtMs: number, alpha: number) => void) => {
			tick = onTick;
			frame = onFrame ?? (() => {});
			return clock;
		},
		step: () => {
			tick();
			frame(1000 / 30, 0);
		},
	};
}

/** A run the pilot plays on its own for `seconds`, or until it ends */
function pilotedRun(seconds: number, seed: number) {
	const store = createGameStore();
	const clock = manualClock();
	const session = new GameSession({
		store,
		createClock: clock.createClock,
		random: seededRandom(seed),
	});
	session.setScreen(SCREEN);
	const pilot = createPilot(
		() => store.getState(),
		() => session.getScreen(),
	);
	session.start(PINK);
	const frames = [];
	for (let t = 0; t < seconds * 30; t++) {
		session.feedTilt(gravityTilt(pilot(), FLAT.up));
		clock.step();
		const frame = store.getState().frame;
		frames.push(frame);
		if (frame.phase === "GAME_OVER") break;
	}
	return frames;
}

describe("pilot", () => {
	it("holds the phone level off play", () => {
		const leaning = { x: 0.1, y: -0.1 };
		const kiosk = { ...running([player]), phase: "KIOSK" as const };
		expect(pilotStep(kiosk, SCREEN, 1, leaning)).toEqual(LEVEL);
		const paused = { ...running([player]), phase: "PAUSED" as const };
		expect(pilotStep(paused, SCREEN, 1, leaning)).toEqual(LEVEL);
	});

	it("rolls towards a dot of its own colour", () => {
		const frame = running([player, dot({ kind: "small", x: 350, y: 437, color: PINK })]);
		const tilt = pilotStep(frame, SCREEN, 1, LEVEL);
		expect(tilt.x).toBeGreaterThan(0.02);
		expect(Math.abs(tilt.y)).toBeLessThan(0.005);
	});

	it("goes for a point dot of another colour over a small dot of its own", () => {
		const frame = running([
			player,
			dot({ kind: "small", x: 201, y: 337, color: PINK }),
			dot({ kind: "point", x: 201, y: 567, color: BLUE, radius: 40 }),
		]);
		expect(pilotStep(frame, SCREEN, 1, LEVEL).y).toBeGreaterThan(0);
	});

	it("rolls away from a wrong-colour dot closing in, a drip forming on a wall included", () => {
		const threat = dot({ kind: "small", x: 261, y: 437, color: BLUE, vx: -4, vy: 0 });
		expect(pilotStep(running([player, threat]), SCREEN, 1, LEVEL).x).toBeLessThan(-0.02);
		const drip = {
			...threat,
			x: 300,
			vx: 0,
			drip: {
				wall: { nx: -1, ny: 0, x: 402, y: 437 },
				progress: 0.5,
				prev: 0.4,
				radius: 20,
				heading: { vx: -1, vy: 0 },
			},
		};
		expect(pilotStep(running([player, drip]), SCREEN, 1, LEVEL).x).toBeLessThan(-0.02);
	});

	it("never goes for a drip of its own colour still forming on its wall", () => {
		const forming = dot({
			kind: "small",
			x: 390,
			y: 437,
			color: PINK,
			drip: {
				wall: { nx: -1, ny: 0, x: 402, y: 437 },
				progress: 0.5,
				prev: 0.4,
				radius: 20,
				heading: { vx: -1, vy: 0 },
			},
		});
		expect(Math.abs(pilotStep(running([player, forming]), SCREEN, 1, LEVEL).x)).toBeLessThan(0.002);
	});

	it("keeps off the walls, where the drips come from", () => {
		const cornered = { ...player, x: 30, y: 437 };
		expect(pilotStep(running([cornered]), SCREEN, 1, LEVEL).x).toBeGreaterThan(0.02);
	});

	it("eases towards the wanted tilt and rolls slower at a faster speed setting", () => {
		const frame = running([player, dot({ kind: "small", x: 350, y: 437, color: PINK })]);
		const first = pilotStep(frame, SCREEN, 1, LEVEL);
		const second = pilotStep(frame, SCREEN, 1, first);
		expect(second.x).toBeGreaterThan(first.x);
		expect(pilotStep(frame, SCREEN, 2, LEVEL).x).toBeCloseTo(first.x / 2);
	});

	it("plays a run that lasts and scores, the same every time for a seed", () => {
		const frames = pilotedRun(120, 6);
		const last = frames[frames.length - 1];
		expect(frames.length).toBeGreaterThan(60 * 30);
		expect(last.score).toBeGreaterThan(60);
		expect(pilotedRun(120, 6).map((f) => f.score)).toEqual(frames.map((f) => f.score));
	});
});
