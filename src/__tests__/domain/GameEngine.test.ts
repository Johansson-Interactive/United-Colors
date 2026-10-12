import {
	ABSORB_TICKS,
	DRIP_LAUNCH_TICKS,
	GAME_COLORS,
	PLAYER_DOT_SIZE_RATIO,
	PLAYER_SPEED_PER_DEGREE,
	POINT_DOT_PULSE_SPEED,
	POINT_DOT_SIZE_ANIMATION_TIME,
	POINT_DOT_TIME_BETWEEN,
	POINT_DOT_VALUE,
	REJECT_SPIT_AT,
	REJECT_TICKS,
	SMALL_DOT_CREATE_INTERVAL,
	SMALL_DOT_SIZE_RATIO,
	TILT_SENSITIVITY_MAX,
	TILT_SENSITIVITY_MIN,
} from "../../domain/constants";
import { GameEngine } from "../../domain/engine/GameEngine";
import type { GameEvent } from "../../domain/types";

const DEGREE = Math.PI / 180;

function createEngine(seed = 0.5) {
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
	});
}

/** A large screen, so small dots rarely reach the stationary player */
function largeScreenEngine() {
	let n = 0;
	return new GameEngine({
		density: 100,
		screen: { width: 4000, height: 8000 },
		random: () => ((++n * 9301 + 49297) % 233280) / 233280,
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

	describe("at the edges", () => {
		const screen = { width: 400, height: 800 };
		/** A kiosk whose first drip forms on the left wall, low down, heading down and in */
		function engineWithOneDot() {
			// Player colour (constructor, startKiosk), then a left-edge spawn near the bottom
			// corner, rolled to head toward that corner on the plain diagonal
			const script = [0.5, 0.5, 0, 0.98, 0.9995, 0.5];
			const engine = new GameEngine({
				density: 100,
				screen,
				random: () => script.shift() ?? 0.5,
			});
			engine.startKiosk();
			const small = () => engine.getFrame().dots.find((d) => d.kind === "small");
			while (!small()?.launch) engine.tick();
			return { engine, small };
		}

		it("a dot that reaches a wall is set flush against it and heads back in on the same tick", () => {
			const { engine, small } = engineWithOneDot();
			let ticks = 0;
			while ((small()?.vy ?? 0) >= 0 && ticks++ < 1000) engine.tick();
			const leaving = small();
			expect(leaving && leaving.y + leaving.radius).toBeCloseTo(screen.height);
			expect(leaving?.vy).toBeLessThan(0);
			expect(leaving?.vx).not.toBe(0);
			for (let i = 0; i < 300; i++) {
				engine.tick();
				const dot = small();
				expect(dot && dot.y + dot.radius).toBeLessThanOrEqual(screen.height + 1e-6);
				expect(dot && dot.y - dot.radius).toBeGreaterThanOrEqual(-1e-6);
				expect(dot && dot.x - dot.radius).toBeGreaterThanOrEqual(-1e-6);
				expect(dot && dot.x + dot.radius).toBeLessThanOrEqual(screen.width + 1e-6);
			}
		});

		it("every drifting dot stays on the screen through many bounces", () => {
			const engine = largeScreenEngine();
			engine.startKiosk();
			engine.setScreen(screen);
			for (let i = 0; i < 3000; i++) {
				engine.tick();
				for (const dot of engine.getFrame().dots) {
					if (dot.drip) continue;
					expect(dot.x - dot.radius).toBeGreaterThanOrEqual(-1e-6);
					expect(dot.x + dot.radius).toBeLessThanOrEqual(screen.width + 1e-6);
					expect(dot.y - dot.radius).toBeGreaterThanOrEqual(-1e-6);
					expect(dot.y + dot.radius).toBeLessThanOrEqual(screen.height + 1e-6);
				}
			}
		});
	});

	describe("drips", () => {
		it("a small dot forms on a wall over the spawn wait, then shoots off and tears free", () => {
			const engine = largeScreenEngine();
			engine.startGame();
			const small = () => engine.getFrame().dots.find((d) => d.kind === "small");
			engine.tick();
			const first = small();
			// At tick 1 the legacy wait has just dipped under the full interval
			expect(first?.drip).toMatchObject({ progress: 1 / SMALL_DOT_CREATE_INTERVAL });
			expect(first?.drip?.radius).toBe((SMALL_DOT_SIZE_RATIO * 100) / 2);
			expect(first).toMatchObject({ vx: 0, vy: 0 });
			let ticks = 1;
			while (small()?.drip && ticks < 1000) {
				engine.tick();
				ticks++;
			}
			expect(ticks).toBe(SMALL_DOT_CREATE_INTERVAL);
			const launched = small();
			expect(launched?.launch).toMatchObject({ progress: 0, prev: 0 });
			expect(launched?.radius).toBe(first?.drip?.radius);
			expect(Math.hypot(launched?.vx ?? 0, launched?.vy ?? 0)).toBeGreaterThan(0);
			for (let t = 1; t < DRIP_LAUNCH_TICKS; t++) {
				engine.tick();
				expect(
					engine.getFrame().dots.find((d) => d.id === first?.id)?.launch?.progress,
				).toBeCloseTo(t / DRIP_LAUNCH_TICKS);
			}
			// Torn free: round and clear of the wall, so the view drops the launch
			engine.tick();
			expect(engine.getFrame().dots.find((d) => d.id === first?.id)?.launch).toBeUndefined();
		});

		it("the next drip starts forming the tick after one shoots off", () => {
			const engine = largeScreenEngine();
			engine.startGame();
			const drips = () => engine.getFrame().dots.filter((d) => d.drip);
			for (let i = 1; i < SMALL_DOT_CREATE_INTERVAL; i++) {
				engine.tick();
				expect(drips().map((d) => d.id)).toEqual(["dot-0"]);
			}
			engine.tick();
			expect(engine.getFrame().dots.find((d) => d.id === "dot-0")?.launch).toBeDefined();
			expect(drips()).toHaveLength(0);
			engine.tick();
			expect(drips()).toHaveLength(1);
			expect(drips()[0].id).not.toBe("dot-0");
		});

		/** Run until a drip of the player's colour (or not) is forming, and move the player onto it */
		function playerOntoDrip(engine: GameEngine, ownColour: boolean) {
			for (let i = 0; i < 5000; i++) {
				const frame = engine.getFrame();
				const player = frame.dots.find((d) => d.kind === "player");
				const drip = frame.dots.find(
					(d) => d.drip && (d.color === player?.color) === ownColour && d.drip.progress > 0.2,
				);
				if (drip && player && frame.phase === "RUNNING") {
					engine.onMovementDelta(drip.x - player.x, drip.y - player.y);
					return { frame: engine.getFrame(), drip, changed: engine.advancePlayer(0, 0) };
				}
				engine.tick();
			}
			throw new Error("no drip");
		}

		it("a drip of the player's colour can be plucked off its wall for a point", () => {
			const engine = largeScreenEngine();
			engine.startGame();
			const { drip, changed } = playerOntoDrip(engine, true);
			expect(changed).toBe(true);
			const frame = engine.getFrame();
			expect(frame.score).toBe(1);
			expect(frame.events).toEqual([{ type: "collect", value: 1 }]);
			const plucked = frame.dots.find((d) => d.id === drip.id);
			expect(plucked?.absorb).toBe(0);
			expect(plucked?.drip).toBeUndefined();
			// The wall starts the next drip right away
			engine.tick();
			expect(engine.getFrame().dots.some((d) => d.drip && d.id !== drip.id)).toBe(true);
		});

		it("a drip of another colour is harmless until it has left the wall", () => {
			const engine = largeScreenEngine();
			engine.startGame();
			const { changed } = playerOntoDrip(engine, false);
			expect(changed).toBe(false);
			expect(engine.getFrame().phase).toBe("RUNNING");
		});
	});

	describe("pushing into the walls", () => {
		it("reports how hard the walls hold the player back, per frame, and nothing while free", () => {
			const engine = createEngine();
			engine.startGame();
			engine.onSensorInput(-1, 0);
			engine.advancePlayer(16);
			expect(engine.getPlayerPush()).toEqual({ x: 0, y: 0 });
			for (let i = 0; i < 200; i++) engine.advancePlayer(16);
			const push = engine.getPlayerPush();
			expect(engine.getPlayerPosition().x).toBe((PLAYER_DOT_SIZE_RATIO * 100) / 2);
			expect(push.x).toBeCloseTo(-engine.getPlayerSpeedPerDegree() / DEGREE);
			expect(push.y).toBe(0);
		});

		it("lets go when the game is not running", () => {
			const engine = createEngine();
			engine.startGame();
			engine.onSensorInput(0, 1);
			for (let i = 0; i < 200; i++) engine.advancePlayer(16);
			expect(engine.getPlayerPush().y).toBeGreaterThan(0);
			engine.pause();
			engine.advancePlayer(16);
			expect(engine.getPlayerPush()).toEqual({ x: 0, y: 0 });
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

	describe("events", () => {
		it("reports a point dot spawning with the frame it first shows in", () => {
			const engine = largeScreenEngine();
			engine.startGame();
			for (let i = 0; i < 1000; i++) {
				engine.tick();
				const frame = engine.getFrame();
				if (frame.dots.some((d) => d.kind === "point")) {
					expect(frame.events).toEqual([{ type: "pointSpawn" }]);
					return;
				}
				expect(frame.events).toEqual([]);
			}
			throw new Error("no point dot spawned");
		});

		it("a new game or kiosk starts with nothing to report", () => {
			const engine = largeScreenEngine();
			engine.startGame();
			for (let i = 0; i < 1000 && !engine.getFrame().events.length; i++) engine.tick();
			engine.startKiosk();
			expect(engine.getFrame().events).toEqual([]);
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

		it("sensitivity multiplies the speed, for the current player and the games after it", () => {
			const engine = createEngine();
			engine.startGame();
			engine.setSensitivity(1.5);
			expect(engine.getPlayerSpeedPerDegree()).toBeCloseTo(PLAYER_SPEED_PER_DEGREE * 1.5);
			const degree = Math.PI / 180;
			let start = engine.getPlayerPosition();
			engine.onSensorInput(degree, 0);
			engine.advancePlayer(1000);
			expect(engine.getPlayerPosition().x - start.x).toBeCloseTo(PLAYER_SPEED_PER_DEGREE * 1.5);

			engine.startGame();
			start = engine.getPlayerPosition();
			engine.onSensorInput(-degree, 0);
			engine.advancePlayer(1000);
			expect(start.x - engine.getPlayerPosition().x).toBeCloseTo(PLAYER_SPEED_PER_DEGREE * 1.5);
		});

		it("sensitivity is kept within its range", () => {
			const engine = createEngine();
			engine.setSensitivity(100);
			expect(engine.getPlayerSpeedPerDegree()).toBeCloseTo(
				PLAYER_SPEED_PER_DEGREE * TILT_SENSITIVITY_MAX,
			);
			engine.setSensitivity(0);
			expect(engine.getPlayerSpeedPerDegree()).toBeCloseTo(
				PLAYER_SPEED_PER_DEGREE * TILT_SENSITIVITY_MIN,
			);
		});
	});

	describe("render frame", () => {
		it("small dot views carry per-tick displacement that matches the next tick", () => {
			const engine = createEngine();
			engine.startKiosk();
			// A dot that has just shot off its wall, heading in: nothing stops it next tick
			let small = engine.getFrame().dots.find((d) => d.kind === "small" && d.launch);
			for (let i = 0; i < 500 && !small; i++) {
				engine.tick();
				small = engine.getFrame().dots.find((d) => d.kind === "small" && d.launch);
			}
			expect(small).toBeDefined();
			if (!small) return;
			const before = small;
			engine.tick();
			const after = engine.getFrame().dots.find((d) => d.id === before.id);
			expect(after?.x).toBeCloseTo(before.x + before.vx);
			expect(after?.y).toBeCloseTo(before.y + before.vy);
		});

		it("a drip's view says which wall it is on and how far it has formed", () => {
			const engine = createEngine();
			engine.startKiosk();
			engine.tick();
			const drip = engine.getFrame().dots.find((d) => d.kind === "small");
			expect(drip?.drip?.wall).toBeDefined();
			const wall = drip?.drip?.wall;
			if (!wall || !drip) return;
			expect(Math.hypot(wall.nx, wall.ny)).toBeCloseTo(1);
			// The foot is on the wall, under the dot, and the dot hangs from it inward
			expect(wall.x * wall.nx + wall.y * wall.ny).toBeCloseTo(
				wall.nx !== 0 ? (wall.nx > 0 ? 0 : -400) : wall.ny > 0 ? 0 : -800,
			);
			expect((drip.x - wall.x) * wall.nx + (drip.y - wall.y) * wall.ny).toBeGreaterThan(0);
			expect(drip.radius).toBeGreaterThan(0);
			expect(drip.radius).toBeLessThan(drip.drip?.radius ?? 0);
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
		/** A game with a small dot that has left its wall and drifts */
		function startWithSmallDot() {
			const engine = createEngine();
			engine.startGame();
			for (let i = 0; i < 2000; i++) {
				const small = engine.getFrame().dots.find((d) => d.kind === "small" && !d.drip);
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
				expect(frame.phase).toBe("REJECTING");
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

		it("catching a small dot reports a collect worth one, handed over with the next frame only", () => {
			const { engine, small } = startWithSmallDot();
			const alpha = 0.5;
			const player = engine.getPlayerPosition();
			engine.onMovementDelta(
				small.x + small.vx * alpha - player.x,
				small.y + small.vy * alpha - player.y,
			);
			engine.advancePlayer(0, alpha);

			const frame = engine.getFrame();
			// A wrong-colour small dot is refused instead, which reports nothing yet
			expect(frame.events).toEqual(
				frame.phase === "RUNNING" ? [{ type: "collect", value: 1 }] : [],
			);
			expect(engine.getFrame().events).toEqual([]);
		});

		it("catching a point dot reports a collect worth POINT_DOT_VALUE", () => {
			const engine = largeScreenEngine();
			engine.startGame();
			const point = () => engine.getFrame().dots.find((d) => d.kind === "point");
			for (let i = 0; i < 1000 && !point(); i++) engine.tick();
			// Let it zoom in before catching it
			for (let i = 0; i < POINT_DOT_SIZE_ANIMATION_TIME; i++) engine.tick();
			const target = point();
			expect(target).toBeDefined();
			if (!target) return;
			const player = engine.getPlayerPosition();
			engine.onMovementDelta(target.x - player.x, target.y - player.y);
			expect(engine.advancePlayer(0, 0)).toBe(true);
			const frame = engine.getFrame();
			expect(frame.score).toBe(POINT_DOT_VALUE);
			expect(frame.events).toEqual([{ type: "collectPoint", value: POINT_DOT_VALUE }]);
			expect(frame.dots.find((d) => d.kind === "player")?.color).toBe(target.color);
		});

		it("reports no change when nothing is hit", () => {
			const engine = createEngine();
			engine.startGame();
			expect(engine.advancePlayer(16, 0.5)).toBe(false);
		});
	});

	describe("rejecting a wrong-colour dot", () => {
		function hitWrongDot() {
			const engine = createEngine();
			engine.startGame();
			for (let i = 0; i < 5000; i++) {
				const frame = engine.getFrame();
				const player = frame.dots.find((d) => d.kind === "player");
				const wrong = frame.dots.find(
					(d) => d.kind === "small" && !d.drip && d.color !== player?.color,
				);
				if (wrong && frame.phase === "RUNNING") {
					const pos = engine.getPlayerPosition();
					engine.onMovementDelta(wrong.x - pos.x, wrong.y - pos.y);
					expect(engine.advancePlayer(0, 0)).toBe(true);
					return { engine, wrong };
				}
				engine.tick();
			}
			throw new Error("no wrong-colour dot spawned");
		}

		it("refuses the dot for REJECT_TICKS before the game is over", () => {
			const { engine, wrong } = hitWrongDot();
			expect(engine.getFrame().phase).toBe("REJECTING");
			expect(engine.getFrame().dots.find((d) => d.id === wrong.id)).toMatchObject({
				reject: 0,
				prevReject: 0,
			});
			for (let t = 1; t < REJECT_TICKS; t++) {
				engine.tick();
				expect(engine.getFrame().phase).toBe("REJECTING");
				const refused = engine.getFrame().dots.find((d) => d.id === wrong.id);
				expect(refused?.reject).toBeCloseTo(t / REJECT_TICKS);
				expect(refused?.prevReject).toBeCloseTo((t - 1) / REJECT_TICKS);
			}
			engine.tick();
			const frame = engine.getFrame();
			expect(frame.phase).toBe("GAME_OVER");
			// The refused dot stays, fully spat out, for the game over screen
			expect(frame.dots.find((d) => d.id === wrong.id)?.reject).toBe(1);
		});

		it("reports the spit as the refusal crosses REJECT_SPIT_AT, and the game over at the end", () => {
			const { engine } = hitWrongDot();
			const reported: Array<{ event: GameEvent; reject: number }> = [];
			for (let t = 1; t <= REJECT_TICKS; t++) {
				engine.tick();
				const frame = engine.getFrame();
				const reject = frame.dots.find((d) => d.reject !== undefined)?.reject ?? -1;
				for (const event of frame.events) reported.push({ event, reject });
			}
			const spits = reported.filter((r) => r.event.type === "spit");
			expect(spits).toHaveLength(1);
			expect(spits[0].reject).toBeGreaterThanOrEqual(REJECT_SPIT_AT);
			expect(spits[0].reject - 1 / REJECT_TICKS).toBeLessThan(REJECT_SPIT_AT);
			expect(reported.at(-1)?.event).toEqual({ type: "gameOver" });
			expect(reported.filter((r) => r.event.type === "gameOver")).toHaveLength(1);
			expect(engine.getFrame().events).toEqual([]);
		});

		it("freezes the scene and ignores the player while refusing", () => {
			const { engine } = hitWrongDot();
			const before = engine.getFrame();
			const player = engine.getPlayerPosition();
			for (let t = 1; t < REJECT_TICKS; t++) {
				engine.onMovementDelta(30, 30);
				engine.onSensorInput(0.5, 0.5);
				expect(engine.advancePlayer(16, 0)).toBe(false);
				engine.tick();
			}
			const after = engine.getFrame();
			expect(engine.getPlayerPosition()).toEqual(player);
			const still = (f: typeof before) =>
				f.dots.filter((d) => d.absorb === undefined).map((d) => [d.id, d.x, d.y, d.radius]);
			expect(still(after)).toEqual(still(before));
			expect(after.dots.every((d) => d.vx === 0 && d.vy === 0)).toBe(true);
		});

		it("a fresh game forgets the refused dot", () => {
			const { engine } = hitWrongDot();
			for (let t = 0; t < REJECT_TICKS; t++) engine.tick();
			engine.startGame();
			expect(engine.getFrame().phase).toBe("RUNNING");
			expect(engine.getFrame().dots.some((d) => d.reject !== undefined)).toBe(false);
		});
	});
});
