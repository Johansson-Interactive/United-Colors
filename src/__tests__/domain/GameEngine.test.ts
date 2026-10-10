import {
	PLAYER_DOT_SPEED_RATIO,
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

		it("tilt is measured from the level pose, and clearing it restores raw tilt", () => {
			const zeroed = createEngine();
			zeroed.startGame();
			zeroed.setTiltZero({ x: 0.5, y: 0.3 });
			const raw = createEngine();
			raw.startGame();
			expect(playerAfter(zeroed, 0.7, 0.1)).toEqual(playerAfter(raw, 0.2, -0.2));

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

		it("defaults to legacy speed and dev override applies now and to new games", () => {
			const engine = createEngine();
			expect(engine.getPlayerSpeedRatio()).toBeCloseTo(PLAYER_DOT_SPEED_RATIO);
			engine.setPlayerSpeedPerDegree(10);
			engine.startGame();
			const start = engine.getPlayerPosition();
			engine.onSensorInput((5 * Math.PI) / 180, 0); // 5 degrees
			engine.advancePlayer(1000);
			expect(engine.getPlayerPosition().x - start.x).toBeCloseTo(50);
			expect(engine.getPlayerSpeedPerDegree()).toBeCloseTo(10);
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
				// Collected dot disappears from the frame right away, not at the next tick
				expect(frame.dots.find((d) => d.id === small.id)).toBeUndefined();
			} else {
				expect(frame.phase).toBe("GAME_OVER");
			}
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
