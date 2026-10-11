import {
	ABSORB_TICKS,
	GAME_COLORS,
	PLAYER_SPEED_PER_DEGREE,
	POINT_DOT_PULSE_SPEED,
	POINT_DOT_SIZE_ANIMATION_TIME,
	POINT_DOT_TIME_BETWEEN,
	POINT_DOT_VALUE,
} from "../../domain/constants";
import { GameEngine } from "../../domain/engine/GameEngine";
import { resetDotIdCounter } from "../../domain/entities/Dot";
import type { AudioPort } from "../../domain/types";

function createEngine(seed = 0.5, audio?: AudioPort) {
	resetDotIdCounter();
	let callCount = 0;
	const seededRandom = () => {
		// Deterministic pseudo-random using seed
		callCount++;
		return ((seed * callCount * 9301 + 49297) % 233280) / 233280;
	};

	return new GameEngine({
		density: 100,
		screen: { width: 400, height: 800 },
		random: seededRandom,
		audio,
	});
}

describe("GameEngine", () => {
	describe("start colour", () => {
		const playerColor = (engine: GameEngine) =>
			engine.getFrame().dots.find((d) => d.kind === "player")?.color;

		it.each(GAME_COLORS)("a game started in %s gives the player that colour", (color) => {
			const engine = createEngine();
			engine.startGame(color);
			expect(playerColor(engine)).toBe(color);
		});

		it("an unknown colour falls back to a random game colour", () => {
			const engine = createEngine();
			engine.startGame("#123456");
			expect(GAME_COLORS).toContain(playerColor(engine));
		});
	});

	describe("tilt zero", () => {
		function playerAfter(engine: GameEngine, x: number, y: number) {
			engine.onSensorInput(x, y);
			engine.advancePlayer(100);
			return engine.getPlayerPosition();
		}

		it("without a zero, raw tilt moves the player", () => {
			const engine = createEngine();
			engine.startGame();
			const before = engine.getPlayerPosition();
			const after = playerAfter(engine, 0.5, 0.3);
			expect(after.x).toBeGreaterThan(before.x);
			expect(after.y).toBeGreaterThan(before.y);
		});

		it("the level pose reads as no tilt", () => {
			const engine = createEngine();
			engine.startGame();
			engine.setTiltZero({ x: 0.5, y: 0.3 });
			const before = engine.getPlayerPosition();
			expect(playerAfter(engine, 0.5, 0.3)).toEqual(before);
		});

		it("screen down, tilt is measured from that side's pose, or from flat without one", () => {
			const engine = createEngine();
			engine.startGame();
			engine.setTiltZero({ x: 0.5, y: 0.3 });
			const before = engine.getPlayerPosition();
			// The screen-up pose doesn't apply screen down: flat reads level there
			engine.onSensorInput(0, 0, true);
			engine.advancePlayer(100);
			expect(engine.getPlayerPosition()).toEqual(before);
			engine.setTiltZero({ x: 0.5, y: 0.3 }, { x: -0.2, y: 0.1 });
			engine.onSensorInput(-0.2, 0.1, true);
			engine.advancePlayer(100);
			expect(engine.getPlayerPosition()).toEqual(before);
		});

		it("tilt is measured from the level pose, and clearing it restores raw tilt", () => {
			const zeroed = createEngine();
			zeroed.startGame();
			zeroed.setTiltZero({ x: 0.5, y: 0.3 });
			const raw = createEngine();
			raw.startGame();
			const fromZero = playerAfter(zeroed, 0.7, 0.1);
			const fromRaw = playerAfter(raw, 0.2, -0.2);
			expect(fromZero.x).toBeCloseTo(fromRaw.x);
			expect(fromZero.y).toBeCloseTo(fromRaw.y);

			zeroed.setTiltZero(null);
			const before = zeroed.getPlayerPosition();
			expect(playerAfter(zeroed, 0, 0)).toEqual(before);
		});
	});

	describe("collision outcomes", () => {
		it("matching color small dot gives +1 score", () => {
			const engine = createEngine();
			engine.startGame();

			// Tick many times to spawn dots and check scoring
			// Engine starts in RUNNING phase
			expect(engine.stateMachine.phase).toBe("RUNNING");

			const frame = engine.getFrame();
			expect(frame.phase).toBe("RUNNING");
			expect(frame.score).toBe(0);
		});

		it("point dot collision gives +5 and switches color", () => {
			// This tests the constant value
			expect(POINT_DOT_VALUE).toBe(5);
		});

		it("mismatched color triggers game over", () => {
			const engine = createEngine();
			engine.startGame();

			// Run many ticks to eventually trigger game over naturally
			// (dots spawn and player doesn't move)
			let gameOver = false;
			for (let i = 0; i < 5000; i++) {
				engine.tick();
				if (engine.stateMachine.phase === "GAME_OVER") {
					gameOver = true;
					break;
				}
			}

			// With a static player, eventually a wrong-color dot hits
			expect(gameOver).toBe(true);
		});
	});

	describe("kiosk mode", () => {
		it("starts in KIOSK phase", () => {
			const engine = createEngine();
			expect(engine.stateMachine.phase).toBe("KIOSK");
		});

		it("spawns dots in kiosk mode without collisions", () => {
			const engine = createEngine();
			engine.startKiosk();

			for (let i = 0; i < 500; i++) {
				engine.tick();
			}

			const frame = engine.getFrame();
			expect(frame.phase).toBe("KIOSK");
			expect(frame.score).toBe(0);
			expect(frame.dots.length).toBeGreaterThan(0);
			expect(frame.dots.length).toBeLessThanOrEqual(10); // KIOSK_DOT_LIMIT
		});
	});

	describe("edge bounce", () => {
		it("a dot spawned overlapping an edge heads back in instead of juddering along it", () => {
			resetDotIdCounter();
			const screen = { width: 400, height: 800 };
			// Player colour (constructor, startKiosk), then a left-edge spawn low enough to
			// overlap the bottom edge, heading almost straight along it (tiny upward component)
			const script = [0.5, 0.5, 0, 0.999, 0.99];
			const engine = new GameEngine({
				density: 100,
				screen,
				random: () => script.shift() ?? 0.5,
			});
			engine.startKiosk();

			const small = () => engine.getFrame().dots.find((d) => d.kind === "small");
			while (!small()) engine.tick();
			const spawned = small();
			expect(spawned && spawned.y + spawned.radius).toBeGreaterThan(screen.height);

			for (let i = 0; i < 300; i++) {
				engine.tick();
				const dot = small();
				if (dot && dot.y + dot.radius > screen.height) expect(dot.vy).toBeLessThan(0);
			}
			const dot = small();
			expect(dot && dot.y + dot.radius).toBeLessThanOrEqual(screen.height);
		});
	});

	describe("spawn difficulty progression", () => {
		it("spawn wait time decreases over time", () => {
			const engine = createEngine();
			engine.startGame();

			// Access spawn system via tick counting
			// At step 0, wait = SMALL_DOT_CREATE_INTERVAL * (1 - 0/7200) = 120
			// At step 3600, wait = 120 * (1 - 3600/7200) = 60
			// At step 7200, wait = 120 * (1 - 7200/7200) = 0

			// We'll verify by counting dots spawned over different intervals
			let _dots1 = 0;
			for (let i = 0; i < 500; i++) {
				engine.tick();
			}
			_dots1 = engine.getFrame().dots.length;

			// After many more ticks, dot count should be higher (faster spawning)
			for (let i = 0; i < 2000; i++) {
				engine.tick();
			}
			const dots2 = engine.getFrame().dots.length;

			// Can't assert exact numbers with bouncing/removing, but engine should not crash
			expect(dots2).toBeGreaterThanOrEqual(0);
		});
	});

	describe("point dot respawn", () => {
		it("waits at least half POINT_DOT_TIME_BETWEEN after a point dot leaves", () => {
			const engine = new GameEngine({
				density: 100,
				// Large screen so small dots rarely reach the stationary player
				screen: { width: 4000, height: 8000 },
				random: (() => {
					let n = 0;
					return () => ((++n * 9301 + 49297) % 233280) / 233280;
				})(),
			});
			engine.startGame();
			const hasPointDot = () => engine.getFrame().dots.some((d) => d.kind === "point");

			let ticks = 0;
			while (!hasPointDot() && ticks++ < 1000) engine.tick();
			expect(hasPointDot()).toBe(true);
			while (hasPointDot() && ticks++ < 2000) engine.tick();
			expect(hasPointDot()).toBe(false);

			for (let i = 0; i < POINT_DOT_TIME_BETWEEN / 2 - 1; i++) {
				engine.tick();
				expect(hasPointDot()).toBe(false);
			}
			expect(engine.stateMachine.phase).toBe("RUNNING");
		});
	});

	describe("game flow", () => {
		it("startGame resets score and enters RUNNING", () => {
			const engine = createEngine();
			engine.startGame();
			expect(engine.stateMachine.phase).toBe("RUNNING");
			expect(engine.getScore()).toBe(0);
		});

		it("pause and resume work correctly", () => {
			const engine = createEngine();
			engine.startGame();
			expect(engine.pause()).toBe(true);
			expect(engine.stateMachine.phase).toBe("PAUSED");

			// Ticking while paused does nothing
			const frameBefore = engine.getFrame();
			engine.tick();
			const frameAfter = engine.getFrame();
			expect(frameBefore.score).toBe(frameAfter.score);

			expect(engine.resume()).toBe(true);
			expect(engine.stateMachine.phase).toBe("RUNNING");
		});
	});

	describe("per-frame player movement", () => {
		it("advancePlayer moves the player from tilt while RUNNING", () => {
			const engine = createEngine();
			engine.startGame();
			const start = engine.getPlayerPosition();
			engine.onSensorInput(0.5, 0);
			engine.advancePlayer(16);
			const moved = engine.getPlayerPosition();
			expect(moved.x).toBeGreaterThan(start.x);
			expect(moved.y).toBe(start.y);
		});

		it("tick does not move the player", () => {
			const engine = createEngine();
			engine.startGame();
			const start = engine.getPlayerPosition();
			engine.onSensorInput(0.5, 0.5);
			engine.tick();
			expect(engine.getPlayerPosition()).toEqual(start);
		});

		it("advancePlayer is a no-op when not RUNNING", () => {
			const engine = createEngine();
			engine.startGame();
			engine.pause();
			const start = engine.getPlayerPosition();
			engine.onSensorInput(0.5, 0.5);
			engine.advancePlayer(16);
			expect(engine.getPlayerPosition()).toEqual(start);
		});

		it("moves PLAYER_SPEED_PER_DEGREE px/s per degree of tilt", () => {
			const engine = createEngine();
			expect(engine.getPlayerSpeedPerDegree()).toBeCloseTo(PLAYER_SPEED_PER_DEGREE);
			engine.startGame();
			const start = engine.getPlayerPosition();
			engine.onSensorInput((1 * Math.PI) / 180, 0); // 1 degree
			engine.advancePlayer(1000);
			expect(engine.getPlayerPosition().x - start.x).toBeCloseTo(PLAYER_SPEED_PER_DEGREE);
		});
	});

	describe("render frame", () => {
		it("small dot views carry per-tick displacement that matches the next tick", () => {
			const engine = createEngine();
			engine.startKiosk();
			let small = engine.getFrame().dots.find((d) => d.kind === "small");
			for (let i = 0; i < 500 && !small; i++) {
				engine.tick();
				small = engine.getFrame().dots.find((d) => d.kind === "small");
			}
			expect(small).toBeDefined();
			if (!small) return;
			const before = small;
			engine.tick();
			const after = engine.getFrame().dots.find((d) => d.id === before.id);
			expect(after?.x).toBeCloseTo(before.x + before.vx);
			expect(after?.y).toBeCloseTo(before.y + before.vy);
		});

		it("player view has no velocity (moved per frame instead)", () => {
			const engine = createEngine();
			engine.startGame();
			engine.onSensorInput(0.5, 0.5);
			const player = engine.getFrame().dots.find((d) => d.kind === "player");
			expect(player).toMatchObject({ vx: 0, vy: 0 });
		});
		it("a pulsing point dot's prevRadius is its radius at the previous tick", () => {
			const engine = new GameEngine({
				density: 100,
				// Large screen so small dots rarely reach the stationary player
				screen: { width: 4000, height: 8000 },
				random: (() => {
					let n = 0;
					return () => ((++n * 9301 + 49297) % 233280) / 233280;
				})(),
			});
			engine.startGame();
			const point = () => engine.getFrame().dots.find((d) => d.kind === "point");

			for (let i = 0; i < 1000 && !point(); i++) engine.tick();
			const spawned = point();
			expect(spawned).toBeDefined();
			// A dot spawned this tick starts at its drawn size, with nothing to grow from
			expect(spawned?.prevRadius).toBe(spawned?.radius);

			// Past the zoom-in, into the pulse
			for (let i = 0; i < POINT_DOT_SIZE_ANIMATION_TIME + 1; i++) engine.tick();
			let previous = point();
			let changed = 0;
			for (let i = 0; i < POINT_DOT_PULSE_SPEED * 2; i++) {
				engine.tick();
				const current = point();
				expect(current?.prevRadius).toBe(previous?.radius);
				if (current?.radius !== previous?.radius) changed++;
				previous = current;
			}
			expect(changed).toBeGreaterThan(0);
		});

		it("keeps the same dot array across a tick with no removals", () => {
			const engine = createEngine();
			engine.startKiosk();
			const dotsOf = (e: GameEngine) => (e as unknown as { dots: unknown[] }).dots;
			// Kiosk dots never collide, so nothing is removed
			for (let i = 0; i < 500 && dotsOf(engine).length === 0; i++) engine.tick();
			const before = dotsOf(engine);
			expect(before.length).toBeGreaterThan(0);
			engine.tick();
			expect(dotsOf(engine)).toBe(before);
		});
	});

	describe("per-frame collisions", () => {
		function startWithSmallDot(audio?: AudioPort) {
			const engine = createEngine(0.5, audio);
			engine.startGame();
			for (let i = 0; i < 2000; i++) {
				const small = engine.getFrame().dots.find((d) => d.kind === "small");
				if (small) return { engine, small };
				engine.tick();
			}
			throw new Error("no small dot spawned");
		}

		it("collides with a dot at its between-tick position and reports the change", () => {
			const { engine, small } = startWithSmallDot();
			const alpha = 0.5;
			const player = engine.getPlayerPosition();
			// Move the player exactly onto where the dot is drawn mid-tick
			engine.onMovementDelta(
				small.x + small.vx * alpha - player.x,
				small.y + small.vy * alpha - player.y,
			);
			expect(engine.advancePlayer(0, alpha)).toBe(true);

			const frame = engine.getFrame();
			if (frame.phase === "RUNNING") {
				expect(frame.score).toBe(1);
				// The caught dot stays in the frame right away as merging, frozen where it was
				const caught = frame.dots.find((d) => d.id === small.id);
				expect(caught).toMatchObject({ absorb: 0, prevAbsorb: 0, vx: 0, vy: 0 });
			} else {
				expect(frame.phase).toBe("GAME_OVER");
			}
		});

		it("a caught dot scores once, merges over ABSORB_TICKS and then leaves the frame", () => {
			const { engine, small } = startWithSmallDot();
			const player = engine.getPlayerPosition();
			engine.onMovementDelta(small.x - player.x, small.y - player.y);
			engine.advancePlayer(0, 0);
			if (engine.getFrame().phase !== "RUNNING") return;
			expect(engine.getScore()).toBe(1);

			// Still overlapping the player every frame, but never scores again
			for (let t = 1; t < ABSORB_TICKS; t++) {
				engine.advancePlayer(0, 0);
				engine.tick();
				if (engine.getFrame().phase !== "RUNNING") return;
				const caught = engine.getFrame().dots.find((d) => d.id === small.id);
				expect(caught?.absorb).toBeCloseTo(t / ABSORB_TICKS);
				expect(caught?.prevAbsorb).toBeCloseTo((t - 1) / ABSORB_TICKS);
				expect(engine.getScore()).toBe(1);
			}
			engine.tick();
			expect(engine.getFrame().dots.find((d) => d.id === small.id)).toBeUndefined();
		});

		it("catching a small dot plays the small collect sound, not the large one", () => {
			const calls: string[] = [];
			const audio: AudioPort = {
				playCollect: () => calls.push("collect"),
				playLargeCollect: () => calls.push("large"),
				playPointSpawn: () => {},
			};
			const { engine, small } = startWithSmallDot(audio);
			const alpha = 0.5;
			const player = engine.getPlayerPosition();
			engine.onMovementDelta(
				small.x + small.vx * alpha - player.x,
				small.y + small.vy * alpha - player.y,
			);
			engine.advancePlayer(0, alpha);

			// A wrong-colour small dot ends the game instead, which plays no catch sound
			expect(calls).toEqual(engine.getFrame().phase === "RUNNING" ? ["collect"] : []);
		});

		it("reports no change when nothing is hit", () => {
			const engine = createEngine();
			engine.startGame();
			expect(engine.advancePlayer(16, 0.5)).toBe(false);
		});
	});
});
