import { GAME_DENSITY } from "../domain/constants";
import { GameEngine } from "../domain/engine/GameEngine";
import type { Spawner } from "../domain/engine/Spawner";
import { FLAT, type LevelPoses, levelTilt, type PoseSide } from "../domain/levelPose";
import type { ScreenSize } from "../domain/types";
import type { GameStore } from "./GameStore";
import type { Clock, ClockFactory, SensorSample } from "./ports";
import { createSceneBuilder } from "./renderScene";

export interface GameSessionOptions {
	store: GameStore;
	createClock: ClockFactory;
	/** Pixel density the dot sizes scale with; the game's own (GAME_DENSITY) by default */
	density?: number;
	random?: () => number;
	/** What the game spawns; by default the game's own spawning, drawing on `random` */
	spawner?: Spawner;
	/** Whether a wrong-colour touch ends the run (default); off only for the bench run */
	refusals?: boolean;
}

/** Screen the engine assumes until the canvas reports its layout */
const DEFAULT_SCREEN: ScreenSize = { width: 400, height: 800 };

/**
 * One game on one screen: the engine, the clock that drives it, the store it publishes frames
 * to and the scene it draws. The engine is created on first use at the last laid-out screen
 * size. Every tick publishes a frame; every rendered frame hands the drawable scene to whoever
 * is presenting, without a React render. The session halts itself when the game is over.
 */
export class GameSession {
	private engine: GameEngine | null = null;
	private clock: Clock | null = null;
	private screen = DEFAULT_SCREEN;
	private poses = FLAT;
	/** The level pose the last tilt was measured from (see levelTilt) */
	private side: PoseSide = "up";
	private sensitivity = 1;
	private readonly presenters = new Set<(scene: Float32Array) => void>();
	private readonly buildScene = createSceneBuilder();

	constructor(private readonly options: GameSessionOptions) {}

	/** Draw every scene the session produces; returns a function that stops the presenting */
	present(presenter: (scene: Float32Array) => void): () => void {
		this.presenters.add(presenter);
		return () => {
			this.presenters.delete(presenter);
		};
	}

	setScreen(size: ScreenSize): void {
		this.screen = size;
		this.engine?.setScreen(size);
	}

	/** The screen the game plays on, as last laid out */
	getScreen(): ScreenSize {
		return this.screen;
	}

	/** Show the title's drifting dots */
	startKiosk(): void {
		this.getEngine().startKiosk();
		this.publish();
		this.run();
	}

	/** Start a run with the player in `color` */
	start(color: string): void {
		this.getEngine().startGame(color);
		this.publish();
		this.run();
	}

	/**
	 * Freeze a running game where it is and show it still; false when nothing is running (a
	 * refusal plays out to the game over; the title and the game over screen have nothing to
	 * pause)
	 */
	pause(): boolean {
		const engine = this.engine;
		if (!engine?.pause()) return false;
		this.halt();
		this.publish();
		// Frozen at tick positions; resume restarts at alpha 0, so no jump
		this.draw(0, 0);
		return true;
	}

	/** Carry a paused game on; nothing happens unless one is paused */
	resume(): void {
		const engine = this.engine;
		if (engine?.stateMachine.phase !== "PAUSED" || !engine.resume()) return;
		this.publish();
		this.run();
	}

	/** Start the clock afresh, leaving the phase as it is */
	run(): void {
		this.halt();
		const engine = this.getEngine();
		const clock = this.options.createClock(
			() => {
				engine.tick();
				this.publish();
				if (engine.stateMachine.phase === "GAME_OVER") this.halt();
			},
			(dtMs, alpha) => {
				// The player moves and collides every rendered frame; the other dots are
				// extrapolated between ticks. A frame only reaches React when it changed the
				// score or the phase.
				if (engine.advancePlayer(dtMs, alpha)) this.publish();
				this.draw(alpha, dtMs);
			},
		);
		this.clock = clock;
		clock.start();
	}

	/** Stop the clock, leaving the phase as it is */
	halt(): void {
		this.clock?.stop();
		this.clock = null;
	}

	/** Which way gravity points; the player feels it as tilt from the nearer level pose */
	feedTilt(sample: SensorSample): void {
		const tilt = levelTilt(sample, this.poses, this.side);
		this.side = tilt.side;
		this.engine?.onSensorInput(tilt.x, tilt.y);
	}

	/** Move the player by pixels (touch control); no-op unless a game is running */
	feedDelta(dx: number, dy: number): void {
		this.engine?.onMovementDelta(dx, dy);
	}

	/** The poses that count as level, screen up and turned over */
	setLevelPoses(poses: LevelPoses): void {
		this.poses = poses;
	}

	/** How fast the player moves for a given tilt, as a multiple of the default speed */
	setSensitivity(multiplier: number): void {
		this.sensitivity = multiplier;
		this.engine?.setSensitivity(multiplier);
	}

	private getEngine(): GameEngine {
		if (!this.engine) {
			this.engine = new GameEngine({
				density: this.options.density ?? GAME_DENSITY,
				screen: this.screen,
				random: this.options.random,
				spawner: this.options.spawner,
				refusals: this.options.refusals,
			});
			this.engine.setSensitivity(this.sensitivity);
		}
		return this.engine;
	}

	private publish(): void {
		this.options.store.getState().updateFrame(this.getEngine().getFrame());
	}

	/** Build the scene for this rendered frame and hand it to the presenters */
	private draw(alpha: number, dtMs: number): void {
		const engine = this.getEngine();
		const frame = this.options.store.getState().frame;
		const { x, y } = engine.getPlayerPosition();
		const push = engine.getPlayerPush();
		const pose = { x, y, pushX: push.x, pushY: push.y };
		const scene = this.buildScene(frame, alpha, pose, dtMs, this.screen);
		for (const presenter of this.presenters) presenter(scene);
	}
}
