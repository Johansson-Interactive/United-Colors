/**
 * Core game phase states matching legacy GameManager states, plus REJECTING: the player has
 * touched a dot of the wrong colour and refuses it for REJECT_TICKS before the game ends
 */
export type GamePhase = "KIOSK" | "RUNNING" | "REJECTING" | "PAUSED" | "GAME_OVER";

/**
 * The device pose the player calls "level" (raw tilt in radians); tilt is measured from
 * here, so the dot rests wherever the phone is comfortably held rather than flat on a table.
 */
export interface TiltZero {
	x: number;
	y: number;
}

/** Persisted user settings */
export interface GameSettings {
	/** Sound effects (catches, spawns, game over) */
	soundEnabled: boolean;
	musicEnabled: boolean;
	/** Null until the player has set a level pose */
	tiltZero: TiltZero | null;
	/** Level pose with the screen facing down (lying back, phone overhead); null reads flat */
	tiltZeroDown: TiltZero | null;
}

/** Raw sensor reading from the device gyroscope */
export interface SensorSample {
	x: number;
	y: number;
	/** The screen faces the ground; tilt is then measured from flat screen down */
	facingDown: boolean;
}

/** Visual representation of a dot for the rendering layer */
export interface DotView {
	id: string;
	x: number;
	y: number;
	radius: number;
	/** Radius at the previous tick, for render-side interpolation of size animations */
	prevRadius: number;
	color: string;
	kind: "player" | "small" | "point";
	/** Displacement per simulation tick (px), for render-side extrapolation between ticks */
	vx: number;
	vy: number;
	/**
	 * Set once the player has caught this dot: progress of its merge into the player, 0..1,
	 * at this tick and at the previous one. See ABSORB_TICKS.
	 */
	absorb?: number;
	prevAbsorb?: number;
	/**
	 * Set on the wrong-colour dot that ended the game: progress of the player refusing it,
	 * 0..1, at this tick and at the previous one. Stays 1 once the game is over. See
	 * REJECT_TICKS.
	 */
	reject?: number;
	prevReject?: number;
}

/** Complete frame data emitted by the engine for the presentation layer */
export interface RenderFrame {
	phase: GamePhase;
	score: number;
	dots: DotView[];
}

/** Screen dimensions fed back from the presentation layer */
export interface ScreenSize {
	width: number;
	height: number;
}

/**
 * Port for sensor input -- implemented by infrastructure. One source can feed several listeners;
 * whoever owns it starts and stops it, the others only subscribe.
 */
export interface SensorPort {
	start(): void;
	stop(): void;
	/** Returns a function that removes this listener */
	onSample(listener: (sample: SensorSample) => void): () => void;
}

/** Port for audio playback -- implemented by infrastructure */
export interface AudioPort {
	/** A small dot of the player's colour was caught */
	playCollect(): void;
	/** A point dot was caught and recoloured the player */
	playLargeCollect(): void;
	playPointSpawn(): void;
}

/** Port for persistent storage -- implemented by infrastructure */
export interface StoragePort {
	loadHighScore(): Promise<number>;
	saveHighScore(score: number): Promise<void>;
	loadSettings(): Promise<GameSettings>;
	saveSettings(settings: GameSettings): Promise<void>;
}
