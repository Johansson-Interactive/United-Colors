import { GameSession } from "../../application/GameSession";
import { createGameStore } from "../../application/GameStore";
import type { ClockFactory } from "../../application/ports";
import { dotCount, findPlayer, readDot, sceneDot } from "../../application/sceneRecord";
import { GAME_COLORS } from "../../domain/constants";
import { FLAT_DOWN, FLAT_UP, gravityAt } from "../../domain/levelPose";
import { scriptedSpawner, smallDotAt } from "../domain/stage";

/** A clock cranked by hand: the test decides when a tick or a frame happens */
function manualClock() {
	let callbacks: { onTick: () => void; onFrame: (dtMs: number, alpha: number) => void } | null =
		null;
	let running = false;
	let built = 0;
	const factory: ClockFactory = (onTick, onFrame) => {
		built++;
		return {
			start: () => {
				running = true;
				callbacks = { onTick, onFrame };
			},
			stop: () => {
				running = false;
			},
		};
	};
	return {
		factory,
		tick: () => callbacks?.onTick(),
		frame: (dtMs = 16, alpha = 0) => callbacks?.onFrame(dtMs, alpha),
		get running() {
			return running;
		},
		get built() {
			return built;
		},
	};
}

const SCREEN = { width: 300, height: 600 };

/** The gravity the phone reads tilted by `x`, `y` from flat, screen up */
function tilted(x: number, y: number) {
	return gravityAt({ x, y }, FLAT_UP);
}

/** A session on a hand-cranked clock; `staged` spawns only the dots a test queues on `small` */
function setup({ staged = false } = {}) {
	const store = createGameStore();
	const clock = manualClock();
	const { spawner, small } = scriptedSpawner();
	const session = new GameSession({
		store,
		createClock: clock.factory,
		random: () => 0.5,
		spawner: staged ? spawner : undefined,
	});
	const scenes: Float32Array[] = [];
	session.present((scene) => scenes.push(scene));
	session.setScreen(SCREEN);
	const player = () => store.getState().frame.dots.find((d) => d.kind === "player");
	const phase = () => store.getState().frame.phase;
	return { store, clock, session, scenes, player, phase, small };
}

describe("GameSession", () => {
	it("startKiosk puts the kiosk frame in the store (drifting dots, no player) and runs the clock", () => {
		const { session, clock, player, phase } = setup();
		expect(clock.running).toBe(false);
		session.startKiosk();
		expect(phase()).toBe("KIOSK");
		expect(player()).toBeUndefined();
		expect(clock.running).toBe(true);
	});

	it("every tick publishes the frame and every frame presents the scene", () => {
		const { store, session, clock, scenes } = setup();
		session.startKiosk();
		const before = store.getState().frame;
		clock.tick();
		expect(store.getState().frame).not.toBe(before);
		expect(scenes).toHaveLength(0);
		clock.frame(16, 0.5);
		expect(scenes).toHaveLength(1);
		expect(dotCount(scenes[0])).toBe(store.getState().frame.dots.length);
	});

	it("start begins a run in the chosen colour with the player mid-screen", () => {
		const { session, clock, player, phase } = setup();
		session.startKiosk();
		session.start(GAME_COLORS[1]);
		expect(phase()).toBe("RUNNING");
		expect(player()).toMatchObject({
			x: SCREEN.width / 2,
			y: SCREEN.height / 2,
			color: GAME_COLORS[1],
		});
		expect(clock.running).toBe(true);
	});

	it("pause halts the clock, freezes the frame and presents it once, and only while running", () => {
		const { session, clock, scenes, phase } = setup();
		session.startKiosk();
		expect(session.pause()).toBe(false);
		expect(phase()).toBe("KIOSK");
		session.start(GAME_COLORS[0]);
		clock.frame();
		const drawn = scenes.length;
		expect(session.pause()).toBe(true);
		expect(phase()).toBe("PAUSED");
		expect(clock.running).toBe(false);
		expect(scenes).toHaveLength(drawn + 1);
		expect(session.pause()).toBe(false);
	});

	it("resume carries the run on from the pause", () => {
		const { session, clock, phase } = setup();
		session.startKiosk();
		session.start(GAME_COLORS[0]);
		session.pause();
		session.resume();
		expect(phase()).toBe("RUNNING");
		expect(clock.running).toBe(true);
	});

	it("resume does nothing unless paused", () => {
		const { session, clock, phase } = setup();
		session.startKiosk();
		session.halt();
		session.resume();
		expect(phase()).toBe("KIOSK");
		expect(clock.running).toBe(false);
	});

	it("tilt before the game exists is dropped; once running it moves the player on the next frame", () => {
		const { session, clock, player } = setup();
		session.feedTilt(tilted(0.5, 0));
		session.startKiosk();
		session.start(GAME_COLORS[0]);
		const before = player()?.x ?? 0;
		session.feedTilt(tilted(0.5, 0));
		clock.frame(100, 0);
		clock.tick();
		expect(player()?.x).toBeGreaterThan(before);
	});

	it("tilt is measured from the level pose, even one set before the game exists", () => {
		const { session, clock, player } = setup();
		session.setTiltZero(tilted(0.5, 0), null);
		session.startKiosk();
		session.start(GAME_COLORS[0]);
		const before = player()?.x ?? 0;
		session.feedTilt(tilted(0.5, 0));
		clock.frame(100, 0);
		clock.tick();
		expect(player()?.x).toBe(before);
	});

	it("turned over, tilt is measured from the screen-down pose, or from flat without one", () => {
		const { session, clock, player } = setup();
		session.startKiosk();
		session.start(GAME_COLORS[0]);
		session.setTiltZero(tilted(0.5, 0), null);
		const before = player()?.x ?? 0;
		session.feedTilt(FLAT_DOWN);
		clock.frame(100, 0);
		clock.tick();
		expect(player()?.x).toBe(before);

		const overhead = gravityAt({ x: 0.5, y: 0 }, FLAT_DOWN);
		session.setTiltZero(tilted(0.5, 0), overhead);
		session.feedTilt(overhead);
		clock.frame(100, 0);
		clock.tick();
		expect(player()?.x).toBe(before);
	});

	it("the sensitivity scales the player's speed, even one set before the game exists", () => {
		const { session, clock, player } = setup();
		session.setSensitivity(2);
		session.startKiosk();
		session.start(GAME_COLORS[0]);
		const from = player()?.x ?? 0;
		session.feedTilt(tilted(0.1, 0));
		clock.frame(100, 0);
		clock.tick();
		const doubled = (player()?.x ?? 0) - from;

		session.setSensitivity(1);
		const again = player()?.x ?? 0;
		clock.frame(100, 0);
		clock.tick();
		expect((player()?.x ?? 0) - again).toBeCloseTo(doubled / 2);
	});

	it("a pixel delta moves the player while running, and not while paused", () => {
		const { session, clock, player } = setup();
		session.startKiosk();
		session.start(GAME_COLORS[0]);
		session.feedDelta(10, 0);
		clock.tick();
		expect(player()?.x).toBe(SCREEN.width / 2 + 10);
		session.pause();
		session.feedDelta(10, 0);
		clock.tick();
		expect(player()?.x).toBe(SCREEN.width / 2 + 10);
	});

	it("halt stops the clock without touching the phase; run starts a fresh one", () => {
		const { session, clock, phase } = setup();
		session.startKiosk();
		const built = clock.built;
		session.halt();
		expect(clock.running).toBe(false);
		expect(phase()).toBe("KIOSK");
		session.run();
		expect(clock.running).toBe(true);
		expect(clock.built).toBe(built + 1);
	});

	it("a later screen size reaches the running game", () => {
		const { session, clock, player } = setup();
		session.startKiosk();
		session.start(GAME_COLORS[0]);
		session.setScreen({ width: 100, height: 100 });
		session.feedDelta(1000, 1000);
		clock.tick();
		const p = player();
		expect(p && p.x + p.radius).toBeLessThanOrEqual(100);
		expect(p && p.y + p.radius).toBeLessThanOrEqual(100);
	});

	it("the player pushed into a wall is drawn pressed into it", () => {
		const { session, clock, scenes } = setup();
		session.startKiosk();
		session.start(GAME_COLORS[0]);
		session.feedTilt(tilted(-1, 0));
		for (let i = 0; i < 120; i++) clock.frame(16, 0);
		const scene = scenes[scenes.length - 1];
		const player = readDot(scene, findPlayer(scene), sceneDot());
		expect(player.wallX).toBe(1);
		expect(player.x).toBeLessThan(player.radius);
		expect(player.neck).toBeGreaterThan(0);
	});

	it("presenting can be undone", () => {
		const { session, clock, scenes } = setup();
		const more: Float32Array[] = [];
		const stop = session.present((scene) => more.push(scene));
		session.startKiosk();
		clock.frame();
		stop();
		clock.frame();
		expect(more).toHaveLength(1);
		expect(scenes).toHaveLength(2);
	});

	it("halts itself when the game is over", () => {
		const { session, clock, phase, small } = setup({ staged: true });
		session.startKiosk();
		session.start(GAME_COLORS[0]);
		// A wrong-colour dot forms on the player, then the refusal plays out
		small.push(smallDotAt({ x: SCREEN.width / 2, y: SCREEN.height / 2 }, GAME_COLORS[1]));
		clock.tick();
		expect(phase()).toBe("REJECTING");
		expect(clock.running).toBe(true);
		for (let i = 0; i < 100 && phase() === "REJECTING"; i++) clock.tick();
		expect(phase()).toBe("GAME_OVER");
		expect(clock.running).toBe(false);
	});
});
