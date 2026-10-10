/** Core game phase states matching legacy GameManager states */
export type GamePhase = "KIOSK" | "RUNNING" | "PAUSED" | "GAME_OVER";

/** Persisted user settings */
export interface GameSettings {
	soundEnabled: boolean;
	gyroSensitivity: number;
}

/** Raw sensor reading from the device gyroscope */
export interface SensorSample {
	x: number;
	y: number;
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

/** Port for sensor input -- implemented by infrastructure */
export interface SensorPort {
	start(): void;
	stop(): void;
	onSample(callback: (sample: SensorSample) => void): void;
}

/** Port for audio playback -- implemented by infrastructure */
export interface AudioPort {
	playCollect(): void;
	playPointSpawn(): void;
}

/** Port for persistent storage -- implemented by infrastructure */
export interface StoragePort {
	loadHighScore(): Promise<number>;
	saveHighScore(score: number): Promise<void>;
	loadSettings(): Promise<GameSettings>;
	saveSettings(settings: GameSettings): Promise<void>;
}
