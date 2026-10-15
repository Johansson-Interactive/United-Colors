import type { GameSettings } from "../domain/types";

/** Raw tilt reading from the device, in radians from flat */
export interface SensorSample {
	x: number;
	y: number;
	/** The screen faces the ground; tilt is then measured from flat screen down */
	facingDown: boolean;
}

/**
 * Device tilt. One source can feed several listeners; whoever owns it starts and stops it,
 * the others only subscribe.
 */
export interface SensorPort {
	start(): void;
	stop(): void;
	/** Returns a function that removes this listener */
	onSample(listener: (sample: SensorSample) => void): () => void;
}

/** Persistent storage for the high score and settings */
export interface StoragePort {
	loadHighScore(): Promise<number>;
	saveHighScore(score: number): Promise<void>;
	loadSettings(): Promise<GameSettings>;
	saveSettings(settings: GameSettings): Promise<void>;
}

/** The looping background tracks */
export type MusicTrack = "menu" | "game";

/** What the music should be doing: which loop, and how loud (0..1). Changes fade. */
export interface MusicCue {
	track: MusicTrack | null;
	volume: number;
}

/** App-lifetime audio: the game's sound effects plus the music, its lifecycle and muting */
export interface GameAudio {
	/** Load sounds; safe to call repeatedly and again after dispose */
	load(): Promise<void>;
	/** A small dot of the player's colour was caught; `pitch` raises it, in semitones (0..12) */
	playCollect(pitch: number): void;
	/** A point dot was caught and recoloured the player; `pitch` as for playCollect */
	playLargeCollect(pitch: number): void;
	playPointSpawn(): void;
	/** One-shot stinger when a run ends */
	playGameOver(): void;
	/** Muting effects stops any already playing and silences later plays */
	setEffectsMuted(muted: boolean): void;
	/** Muting music stops the loops; unmuting resumes the current cue */
	setMusicMuted(muted: boolean): void;
	/** Fade the music towards a cue; a cue set before loading finishes applies once loaded */
	setMusic(cue: MusicCue): void;
	/** Release native players; an in-flight load is discarded */
	dispose(): void;
}

/** Touch feedback for game moments */
export interface GameHaptics {
	/** The player spits out a wrong-colour dot it refused */
	spit(): void;
}

/** Holds off the display's idle dimming and sleep; tilting is no touch, so a run looks idle */
export interface ScreenAwake {
	setAwake(awake: boolean): void;
}

/** Report whether the app is in the foreground; returns the unsubscribe */
export type WatchAppActive = (listener: (active: boolean) => void) => () => void;

/** Runs the simulation: ticks at the game rate, frames at the display rate, until stopped */
export interface Clock {
	start(): void;
	stop(): void;
}

/**
 * Builds a clock that calls `onTick` once per simulation step and `onFrame` once per rendered
 * frame with the elapsed ms and `alpha`, the fraction of a step since the last tick
 */
export type ClockFactory = (
	onTick: () => void,
	onFrame: (dtMs: number, alpha: number) => void,
) => Clock;
