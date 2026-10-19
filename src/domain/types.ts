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

/**
 * A wall a dot is in contact with: the unit normal from the wall into the screen, and the
 * foot of the dot on the wall (the point on it nearest the dot's centre)
 */
export interface WallContact {
	nx: number;
	ny: number;
	x: number;
	y: number;
}

/** Where a dot's centre is and how big it is */
export interface Circle {
	x: number;
	y: number;
	radius: number;
}

/** Progress (0..1) of something a dot does at a wall, at this tick and at the previous one */
interface WallProgress {
	wall: WallContact;
	progress: number;
	prev: number;
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
	/**
	 * Set while a small dot is a drip forming on a wall: nothing, then a drop swelling out of
	 * the wall until it shoots off. `radius` is the full radius it grows to; the dot's own
	 * `radius` is how big it is now. See SmallDot.
	 */
	drip?: WallProgress & {
		radius: number;
		/** The unit heading it will shoot off on, which it leans toward as it ripens */
		heading: { vx: number; vy: number };
	};
	/** Set for DRIP_LAUNCH_TICKS after a drip shoots off its wall, while it tears from it */
	launch?: WallProgress;
}

/** What a catch paid and where it falls in its combo (see COMBO_WINDOW_TICKS) */
export interface Catch {
	/** What it added to the score, its combo bonus included */
	value: number;
	/** Its combo step: 1 for a catch on its own or the first of a combo, 2 for the next, ... */
	step: number;
	/** It landed on the same tick as the catch before it, in the same combo */
	sameTick: boolean;
}

/** A combo of two or more catches that ran its course */
interface ComboEnd {
	/** Everything it paid */
	total: number;
	/** Its length */
	catches: number;
}

/**
 * Something that happened in the simulation, for sound, touch and bursts. Each is handed over
 * once, with the next frame.
 */
export type GameEvent =
	/** A small dot of the player's colour was caught */
	| ({ type: "collect" } & Catch)
	/** A point dot was caught and recoloured the player */
	| ({ type: "collectPoint" } & Catch)
	| { type: "pointSpawn" }
	/**
	 * A combo of two or more catches ran its course: its window ran out after the last catch.
	 * None when a refusal or a new run cuts it short
	 */
	| ({ type: "comboEnd" } & ComboEnd)
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

/**
 * How the screen's corners are rounded (see arena.ts): `radius` as the platform states it,
 * and the curve it is drawn with, iOS's continuous corner or a plain circular arc
 */
export interface Corners {
	radius: number;
	curve: "continuous" | "circular";
}

/** Screen dimensions fed back from the presentation layer, and its rounded corners if any */
export interface ScreenSize {
	width: number;
	height: number;
	corners?: Corners;
}
