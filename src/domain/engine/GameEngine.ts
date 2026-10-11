import {
	GAME_COLORS,
	PLAYER_DOT_SIZE_RATIO,
	PLAYER_SPEED_PER_DEGREE,
	POINT_DOT_VALUE,
} from "../constants";
import type { Dot } from "../entities/Dot";
import { PlayerDot } from "../entities/PlayerDot";
import { PointDot } from "../entities/PointDot";
import type { AudioPort, DotView, RenderFrame, ScreenSize, TiltZero } from "../types";
import { circlesOverlap } from "./Collision";
import { SpawnSystem } from "./SpawnSystem";
import { StateMachine } from "./StateMachine";

const DEG_TO_RAD = Math.PI / 180;

export interface GameEngineOptions {
	density: number;
	screen: ScreenSize;
	audio?: AudioPort;
	random?: () => number;
}

/**
 * Core game engine. Drives the simulation each tick.
 * Pure logic -- no React/Expo imports.
 */
export class GameEngine {
	readonly stateMachine: StateMachine;
	private spawnSystem: SpawnSystem;
	private player!: PlayerDot;
	private dots: Dot[] = [];
	private score = 0;
	private timeStep = 0;
	private density: number;
	private screen: ScreenSize;
	private audio?: AudioPort;
	private random: () => number;
	/** Player speed in px/s per radian of tilt */
	private playerSpeed: number;
	/** Set when a dot may have become removable since the last removal pass */
	private hasFlaggedDots = false;
	/** Pose that counts as no tilt; null means the raw sensor frame (flat) */
	private tiltZero: TiltZero | null = null;
	/** The same with the screen facing down */
	private tiltZeroDown: TiltZero | null = null;

	constructor(options: GameEngineOptions) {
		this.density = options.density;
		this.screen = options.screen;
		this.audio = options.audio;
		this.random = options.random ?? Math.random;
		this.playerSpeed = PLAYER_SPEED_PER_DEGREE / DEG_TO_RAD;
		this.stateMachine = new StateMachine("KIOSK");
		this.spawnSystem = new SpawnSystem(this.random);
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
		this.spawnSystem.reset();
		this.initPlayer(color);
		this.dots.push(this.player);
	}

	/** Start kiosk mode */
	startKiosk(): void {
		this.stateMachine.reset();
		this.dots = [];
		this.score = 0;
		this.timeStep = 0;
		this.spawnSystem.reset();
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
	 * Move the player from current tilt over `dtMs` of real time, then check collisions
	 * against the other dots where they are at `alpha` (0..1, fraction of a tick elapsed
	 * since the last tick) -- the same positions the presentation layer draws.
	 * Called every rendered frame (not at the 30 Hz tick) for direct, low-latency control,
	 * and so a fast player cannot pass through a dot between ticks.
	 * No-op when not RUNNING. Returns true when score or phase changed.
	 */
	advancePlayer(dtMs: number, alpha = 0): boolean {
		if (this.stateMachine.phase !== "RUNNING") return false;
		this.player.advance(dtMs, this.screen);
		const score = this.score;
		this.checkCollisions(alpha);
		return this.score !== score || this.stateMachine.phase !== "RUNNING";
	}

	/** Current player position (for per-frame rendering outside the RenderFrame) */
	getPlayerPosition(): { x: number; y: number } {
		return { x: this.player.x, y: this.player.y };
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

		const isKiosk = phase === "KIOSK";
		this.timeStep++;
		// Dots collected between ticks (per-frame collisions) leave before spawn limits apply
		this.removeFlaggedDots();
		for (const dot of this.dots) dot.prevSize = dot.size;
		const spawnedFrom = this.dots.length;

		// Spawn small dots
		const newDot = this.spawnSystem.trySpawnSmallDot(
			this.timeStep,
			this.dots.length,
			this.screen,
			this.density,
			isKiosk,
		);
		if (newDot) this.dots.push(newDot);

		// Spawn point dots (not in kiosk)
		if (!isKiosk) {
			const newPoint = this.spawnSystem.trySpawnPointDot(
				this.timeStep,
				this.player,
				this.screen,
				this.density,
			);
			if (newPoint) {
				this.dots.push(newPoint);
				this.audio?.playPointSpawn();
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

		// Bounce small dots off screen edges
		for (const dot of this.dots) {
			if (dot instanceof PlayerDot || dot instanceof PointDot) continue;
			this.bounceOffEdges(dot);
		}

		// Check collisions (skip in kiosk)
		if (!isKiosk) {
			this.checkCollisions(0);
		}

		this.removeFlaggedDots();
	}

	/** Produce a RenderFrame for the presentation layer */
	getFrame(): RenderFrame {
		// Skip dots collected between ticks; they are removed at the next tick
		const dots: DotView[] = [];
		for (const dot of this.dots) {
			if (dot.isFlaggedForRemoval) continue;
			const kind =
				dot instanceof PlayerDot ? "player" : dot instanceof PointDot ? "point" : "small";
			const moves = kind !== "player";
			dots.push({
				id: dot.id,
				x: dot.x,
				y: dot.y,
				radius: dot.size / 2,
				prevRadius: dot.prevSize / 2,
				color: dot.color,
				kind,
				// Matches Dot.update; 0 for the player (moved per frame) and stationary point dots
				vx: moves ? dot.vx * dot.velocity : 0,
				vy: moves ? dot.vy * dot.velocity : 0,
			});
		}

		return {
			phase: this.stateMachine.phase,
			score: this.score,
			dots,
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
	 * Point a dot past an edge back inward. Setting the sign (not flipping it) keeps a dot
	 * that is still past the edge next tick -- e.g. spawned overlapping it -- from
	 * reversing every tick and juddering along the edge.
	 */
	private bounceOffEdges(dot: Dot): void {
		const halfSize = dot.size / 2;
		if (dot.x - halfSize < 0) dot.vx = Math.abs(dot.vx);
		else if (dot.x + halfSize > this.screen.width) dot.vx = -Math.abs(dot.vx);
		if (dot.y - halfSize < 0) dot.vy = Math.abs(dot.vy);
		else if (dot.y + halfSize > this.screen.height) dot.vy = -Math.abs(dot.vy);
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

	/** Player vs other dots, with other dots advanced `alpha` of a tick along their velocity */
	private checkCollisions(alpha: number): void {
		const player = this.player;
		for (const dot of this.dots) {
			if (dot === player) continue;
			if (dot.isFlaggedForRemoval) continue;

			const x = dot.x + dot.vx * dot.velocity * alpha;
			const y = dot.y + dot.vy * dot.velocity * alpha;
			if (!circlesOverlap(player.x, player.y, player.size, x, y, dot.size)) continue;

			if (dot instanceof PointDot) {
				this.score += POINT_DOT_VALUE;
				this.player.color = dot.color;
				(dot as PointDot).forceRemove();
				this.hasFlaggedDots = true;
				this.audio?.playLargeCollect();
			} else if (dot.color === this.player.color) {
				this.score += 1;
				dot.flagForRemoval();
				this.hasFlaggedDots = true;
				this.audio?.playCollect();
			} else {
				// Wrong color -- game over
				this.stateMachine.transition("GAME_OVER");
				return;
			}
		}
	}
}
