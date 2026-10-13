import {
	COMBO_WINDOW_TICKS,
	GAME_COLORS,
	PLAYER_DOT_SIZE_RATIO,
	PLAYER_SPEED_PER_DEGREE,
	POINT_DOT_VALUE,
	REJECT_SPIT_AT,
	TILT_SENSITIVITY_MAX,
	TILT_SENSITIVITY_MIN,
} from "../constants";
import type { Dot } from "../entities/Dot";
import { PlayerDot } from "../entities/PlayerDot";
import { SmallDot } from "../entities/SmallDot";
import type {
	Catch,
	Circle,
	DotView,
	GameEvent,
	RenderFrame,
	ScreenSize,
	TiltZero,
} from "../types";
import { circlesOverlap } from "./Collision";
import type { Spawner } from "./Spawner";
import { SpawnSystem } from "./SpawnSystem";
import { StateMachine } from "./StateMachine";

const DEG_TO_RAD = Math.PI / 180;

export interface GameEngineOptions {
	density: number;
	screen: ScreenSize;
	random?: () => number;
	/** What the engine spawns; by default the game's SpawnSystem, drawing on `random` */
	spawner?: Spawner;
}

/**
 * Core game engine. Drives the simulation each tick and reports what happened as events on
 * the next frame. Pure logic -- no React/Expo imports.
 */
export class GameEngine {
	readonly stateMachine: StateMachine;
	private spawner: Spawner;
	private player!: PlayerDot;
	private dots: Dot[] = [];
	private score = 0;
	private timeStep = 0;
	/** Combo step of the last catch (0 before any), and the tick it landed on */
	private comboStep = 0;
	private lastCatchTick = 0;
	private density: number;
	private screen: ScreenSize;
	private random: () => number;
	/** What happened since the last frame was taken */
	private events: GameEvent[] = [];
	/** Player speed in px/s per radian of tilt, at the current sensitivity */
	private playerSpeed: number;
	/** Set when a dot may have become removable since the last removal pass */
	private hasFlaggedDots = false;
	/** The wrong-colour dot being refused while REJECTING (and after, at game over) */
	private rejected: Dot | null = null;
	/** Pose that counts as no tilt; null means the raw sensor frame (flat) */
	private tiltZero: TiltZero | null = null;
	/** The same with the screen facing down */
	private tiltZeroDown: TiltZero | null = null;
	/** Scratch for where each dot is caught between ticks, so collisions allocate nothing */
	private readonly collisionCircle: Circle = { x: 0, y: 0, radius: 0 };

	constructor(options: GameEngineOptions) {
		this.density = options.density;
		this.screen = options.screen;
		this.random = options.random ?? Math.random;
		this.playerSpeed = PLAYER_SPEED_PER_DEGREE / DEG_TO_RAD;
		this.stateMachine = new StateMachine("KIOSK");
		this.spawner = options.spawner ?? new SpawnSystem(this.random);
		this.initPlayer();
	}

	/** Update screen dimensions (e.g. from Canvas onSize) */
	setScreen(screen: ScreenSize): void {
		this.screen = screen;
	}

	/** Start a new game (non-kiosk); the player takes `color` if it is a game colour */
	startGame(color?: string): void {
		this.stateMachine.transition("RUNNING");
		this.dots = [];
		this.score = 0;
		this.timeStep = 0;
		this.comboStep = 0;
		this.rejected = null;
		this.events = [];
		this.spawner.reset();
		this.initPlayer(color);
		this.dots.push(this.player);
	}

	/** Start kiosk mode */
	startKiosk(): void {
		this.stateMachine.reset();
		this.dots = [];
		this.score = 0;
		this.timeStep = 0;
		this.comboStep = 0;
		this.rejected = null;
		this.events = [];
		this.spawner.reset();
		this.initPlayer();
	}

	pause(): boolean {
		return this.stateMachine.transition("PAUSED");
	}

	resume(): boolean {
		return this.stateMachine.transition("RUNNING");
	}

	/**
	 * Measure tilt from these poses from now on, one per side the screen faces (null restores
	 * the raw sensor frame)
	 */
	setTiltZero(zero: TiltZero | null, zeroDown: TiltZero | null = null): void {
		this.tiltZero = zero;
		this.tiltZeroDown = zeroDown;
	}

	/** Feed raw sensor data (radians); the player sees it relative to that side's level pose */
	onSensorInput(x: number, y: number, facingDown = false): void {
		const zero = facingDown ? this.tiltZeroDown : this.tiltZero;
		this.player.updateOrientation(zero ? x - zero.x : x, zero ? y - zero.y : y);
	}

	/** Player speed in px/s per degree of tilt */
	getPlayerSpeedPerDegree(): number {
		return this.playerSpeed * DEG_TO_RAD;
	}

	/**
	 * Move the player this many times the default speed for a given tilt, from now on and for
	 * the games that follow; kept within TILT_SENSITIVITY_MIN..MAX
	 */
	setSensitivity(multiplier: number): void {
		const clamped = Math.min(TILT_SENSITIVITY_MAX, Math.max(TILT_SENSITIVITY_MIN, multiplier));
		this.playerSpeed = (PLAYER_SPEED_PER_DEGREE / DEG_TO_RAD) * clamped;
		this.player.velocity = this.playerSpeed;
	}

	/**
	 * Move the player from current tilt over `dtMs` of real time, then check collisions
	 * against the other dots where they are at `alpha` (0..1, fraction of a tick elapsed
	 * since the last tick) -- the same positions the presentation layer draws.
	 * Called every rendered frame (not at the 30 Hz tick) for direct, low-latency control,
	 * and so a fast player cannot pass through a dot between ticks.
	 * No-op when not RUNNING. Returns true when score or phase changed.
	 */
	advancePlayer(dtMs: number, alpha = 0): boolean {
		if (this.stateMachine.phase !== "RUNNING") {
			this.player.clearPush();
			return false;
		}
		this.player.advance(dtMs, this.screen);
		const score = this.score;
		this.checkCollisions(alpha);
		return this.score !== score || this.stateMachine.phase !== "RUNNING";
	}

	/** Current player position (for per-frame rendering outside the RenderFrame) */
	getPlayerPosition(): { x: number; y: number } {
		return { x: this.player.x, y: this.player.y };
	}

	/**
	 * How hard the player is pushing into the walls as of the last frame: the speed (px/s)
	 * the walls are holding back on each axis, signed toward the wall (negative x is the
	 * left wall, positive y the bottom). Zero on both while free, or not RUNNING.
	 */
	getPlayerPush(): { x: number; y: number } {
		return this.player.push;
	}

	/** Move player by pixel delta (e.g. touch drag). No-op when not RUNNING. */
	onMovementDelta(dx: number, dy: number): void {
		if (this.stateMachine.phase !== "RUNNING") return;
		this.player.applyMovementDelta(dx, dy, this.screen);
	}

	/** Run one simulation tick (30 Hz) */
	tick(): void {
		const phase = this.stateMachine.phase;
		if (phase === "PAUSED" || phase === "GAME_OVER") return;
		if (phase === "REJECTING") {
			this.tickRejecting();
			return;
		}

		const isKiosk = phase === "KIOSK";
		this.timeStep++;
		// Dots that finished merging between ticks leave before spawn limits apply
		this.removeFlaggedDots();
		for (const dot of this.dots) dot.beginTick();
		const spawnedFrom = this.dots.length;

		// Start the next small dot forming on a wall
		const newDot = this.spawner.trySpawnSmallDot(
			this.timeStep,
			this.dots.length,
			this.screen,
			this.density,
			isKiosk,
		);
		if (newDot) this.dots.push(newDot);

		// Spawn point dots (not in kiosk)
		if (!isKiosk) {
			const newPoint = this.spawner.trySpawnPointDot(
				this.timeStep,
				this.player,
				this.screen,
				this.density,
			);
			if (newPoint) {
				this.dots.push(newPoint);
				this.events.push({ type: "pointSpawn" });
			}
		}

		// Update all dots (player moves per frame via advancePlayer)
		for (const dot of this.dots) {
			dot.update(this.timeStep);
			if (dot.isFlaggedForRemoval) this.hasFlaggedDots = true;
		}
		// Dots spawned this tick show their post-update size from the start, with no growth
		for (let i = spawnedFrom; i < this.dots.length; i++) {
			const dot = this.dots[i];
			dot.prevSize = dot.size;
		}

		// Small dots that reached a wall press against it, then head back in
		for (const dot of this.dots) {
			if (dot instanceof SmallDot) this.holdAtEdges(dot);
		}

		// Check collisions (skip in kiosk)
		if (!isKiosk) {
			this.checkCollisions(0);
		}

		this.removeFlaggedDots();
	}

	/** Produce a RenderFrame for the presentation layer; the events since the last one go with it */
	getFrame(): RenderFrame {
		// Skip dots that finished merging between ticks; they are removed at the next tick
		const dots: DotView[] = [];
		for (const dot of this.dots) {
			if (dot.isFlaggedForRemoval) continue;
			const moves =
				dot.kind !== "player" &&
				!dot.isAbsorbing &&
				this.stateMachine.phase !== "REJECTING" &&
				this.stateMachine.phase !== "GAME_OVER";
			dots.push({
				id: dot.id,
				x: dot.x,
				y: dot.y,
				radius: dot.size / 2,
				prevRadius: dot.prevSize / 2,
				color: dot.color,
				kind: dot.kind,
				// Matches Dot.update; 0 for the player (moved per frame) and stationary point dots
				vx: moves ? dot.vx * dot.velocity : 0,
				vy: moves ? dot.vy * dot.velocity : 0,
				absorb: dot.isAbsorbing ? dot.absorb : undefined,
				prevAbsorb: dot.isAbsorbing ? dot.prevAbsorb : undefined,
				reject: dot.isRejecting ? dot.reject : undefined,
				prevReject: dot.isRejecting ? dot.prevReject : undefined,
				...(dot instanceof SmallDot && !dot.isAbsorbing && !dot.isRejecting ? dot.contact() : {}),
			});
		}

		const events = this.events;
		this.events = [];
		return {
			phase: this.stateMachine.phase,
			score: this.score,
			dots,
			events,
		};
	}

	getScore(): number {
		return this.score;
	}

	private initPlayer(startColor?: string): void {
		const color =
			GAME_COLORS.find((c) => c === startColor) ??
			GAME_COLORS[Math.floor(this.random() * GAME_COLORS.length)];
		this.player = new PlayerDot(
			this.screen.width / 2,
			this.screen.height / 2,
			color,
			PLAYER_DOT_SIZE_RATIO * this.density,
			this.playerSpeed,
		);
	}

	/**
	 * A drifting dot that has reached an edge is set flush against it and bounces straight
	 * back in (see SmallDot.bounce); in a corner, off both walls. A drip still forming on its
	 * wall is left alone.
	 */
	private holdAtEdges(dot: SmallDot): void {
		if (!dot.isDrifting) return;
		const radius = dot.size / 2;
		const { width, height } = this.screen;
		if (dot.x - radius < 0) dot.bounce(1, 0, { x: 0, y: dot.y });
		else if (dot.x + radius > width) dot.bounce(-1, 0, { x: width, y: dot.y });
		if (dot.y - radius < 0) dot.bounce(0, 1, { x: dot.x, y: 0 });
		else if (dot.y + radius > height) dot.bounce(0, -1, { x: dot.x, y: height });
	}

	/**
	 * One tick of the player refusing a wrong-colour dot: the scene is frozen (nothing spawns,
	 * moves, pulses or collides), dots already merging finish flowing in, and the refused
	 * dot's progress runs to 1, at which point the game is over. The spit is reported on the
	 * tick the progress crosses REJECT_SPIT_AT.
	 */
	private tickRejecting(): void {
		this.removeFlaggedDots();
		for (const dot of this.dots) dot.beginTick();
		for (const dot of this.dots) {
			if (!dot.isAbsorbing && !dot.isRejecting) continue;
			dot.update(this.timeStep);
			if (dot.isFlaggedForRemoval) this.hasFlaggedDots = true;
		}
		const rejected = this.rejected;
		if (rejected && rejected.prevReject < REJECT_SPIT_AT && rejected.reject >= REJECT_SPIT_AT) {
			this.events.push({ type: "spit" });
		}
		if (rejected === null || rejected.reject >= 1) {
			if (this.stateMachine.transition("GAME_OVER")) this.events.push({ type: "gameOver" });
		}
		this.removeFlaggedDots();
	}

	/** Compact flagged dots out in place; a no-op unless something was flagged */
	private removeFlaggedDots(): void {
		if (!this.hasFlaggedDots) return;
		this.hasFlaggedDots = false;
		let kept = 0;
		for (const dot of this.dots) {
			if (!dot.isFlaggedForRemoval) this.dots[kept++] = dot;
		}
		this.dots.length = kept;
	}

	/** Player vs other dots, each where it is `alpha` of a tick on (see Dot.circleAt) */
	private checkCollisions(alpha: number): void {
		const player = this.player;
		const caught = this.collisionCircle;
		for (const dot of this.dots) {
			if (dot === player) continue;
			if (dot.isFlaggedForRemoval || dot.isAbsorbing) continue;

			dot.circleAt(alpha, caught);
			const { x, y, radius } = caught;
			if (!circlesOverlap(player.x, player.y, player.size, x, y, radius * 2)) continue;

			if (dot.kind === "point") {
				this.player.color = dot.color;
				dot.startAbsorb();
				this.events.push({ type: "collectPoint", ...this.scoreCatch(POINT_DOT_VALUE) });
			} else if (dot.color === this.player.color) {
				// A drip of the player's colour can be plucked off its wall like any other dot
				dot.startAbsorb();
				this.events.push({ type: "collect", ...this.scoreCatch(1) });
			} else if (dot.isForming) {
				// A drip of another colour is part of the wall until it leaves: harmless
			} else {
				// Wrong colour: the player refuses the dot, then the game is over
				dot.startReject();
				this.rejected = dot;
				this.stateMachine.transition("REJECTING");
				return;
			}
		}
	}

	/** Score a catch worth `base` on its own, carrying the combo on if it is still going */
	private scoreCatch(base: number): Catch {
		const since = this.timeStep - this.lastCatchTick;
		const going = this.comboStep > 0 && since <= COMBO_WINDOW_TICKS;
		this.comboStep = going ? this.comboStep + 1 : 1;
		this.lastCatchTick = this.timeStep;
		const value = base + this.comboStep - 1;
		this.score += value;
		return { value, step: this.comboStep, sameTick: going && since === 0 };
	}
}
