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
	/**
	 * How fast the dot moves for a given tilt, as a multiple of the default speed (1); see
	 * TILT_SENSITIVITY_MIN / MAX
	 */
	tiltSensitivity: number;
	/** Null until the player has set a level pose */
	tiltZero: TiltZero | null;
	/** Level pose with the screen facing down (lying back, phone overhead); null reads flat */
	tiltZeroDown: TiltZero | null;
}

/** The player's own dot, a small drifting dot, or a point dot to collect */
export type DotKind = "player" | "small" | "point";

/** Visual representation of a dot for the rendering layer */
export interface DotView {
	id: string;
	x: number;
	y: number;
	radius: number;
	/** Radius at the previous tick, for render-side interpolation of size animations */
	prevRadius: number;
	color: string;
	kind: DotKind;
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

/**
 * Something that happened in the simulation, for sound, touch and bursts. Each is handed over
 * once, with the next frame.
 */
export type GameEvent =
	/** A small dot of the player's colour was caught */
	| { type: "collect"; value: number }
	/** A point dot was caught and recoloured the player */
	| { type: "collectPoint"; value: number }
	| { type: "pointSpawn" }
	/** The player springs back and spits the refused dot out (see REJECT_SPIT_AT) */
	| { type: "spit" }
	| { type: "gameOver" };

/** Complete frame data emitted by the engine for the presentation layer */
export interface RenderFrame {
	phase: GamePhase;
	score: number;
	dots: DotView[];
	/** What happened since the frame before */
	events: GameEvent[];
}

/** Screen dimensions fed back from the presentation layer */
export interface ScreenSize {
	width: number;
	height: number;
}
