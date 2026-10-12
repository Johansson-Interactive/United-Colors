import { GameEngine } from "../domain/engine/GameEngine";
import type { ScreenSize, TiltZero } from "../domain/types";
import type { GameStore } from "./GameStore";
import type { Clock, ClockFactory, SensorSample } from "./ports";
import { createSceneBuilder } from "./renderScene";

export interface GameSessionOptions {
	store: GameStore;
	createClock: ClockFactory;
	/** Pixel density the dot sizes scale with */
	density?: number;
	random?: () => number;
}

/** Screen the engine assumes until the canvas reports its layout */
const DEFAULT_SCREEN: ScreenSize = { width: 400, height: 800 };
const DEFAULT_DENSITY = 400;

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
	private tiltZero: TiltZero | null = null;
	private tiltZeroDown: TiltZero | null = null;
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

	/** Raw device tilt; the player sees it relative to the level pose for that side */
	feedTilt(sample: SensorSample): void {
		this.engine?.onSensorInput(sample.x, sample.y, sample.facingDown);
	}

	/** Move the player by pixels (touch control); no-op unless a game is running */
	feedDelta(dx: number, dy: number): void {
		this.engine?.onMovementDelta(dx, dy);
	}

	/** The poses that count as level with the screen up and down; null reads flat */
	setTiltZero(zero: TiltZero | null, zeroDown: TiltZero | null): void {
		this.tiltZero = zero;
		this.tiltZeroDown = zeroDown;
		this.engine?.setTiltZero(zero, zeroDown);
	}

	/** How fast the player moves for a given tilt, as a multiple of the default speed */
	setSensitivity(multiplier: number): void {
		this.sensitivity = multiplier;
		this.engine?.setSensitivity(multiplier);
	}

	private getEngine(): GameEngine {
		if (!this.engine) {
			this.engine = new GameEngine({
				density: this.options.density ?? DEFAULT_DENSITY,
				screen: this.screen,
				random: this.options.random,
			});
			this.engine.setTiltZero(this.tiltZero, this.tiltZeroDown);
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
		const scene = this.buildScene(frame, alpha, engine.getPlayerPosition(), dtMs);
		for (const presenter of this.presenters) presenter(scene);
	}
}
