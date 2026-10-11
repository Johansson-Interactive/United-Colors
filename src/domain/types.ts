/** Core game phase states matching legacy GameManager states */
export type GamePhase = "KIOSK" | "RUNNING" | "PAUSED" | "GAME_OVER";

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
	gyroSensitivity: number;
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
	timestampMs: number;
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
