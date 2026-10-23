import type { Attitude, GameSettings } from "../domain/types";

/**
 * The device's motion sensor, reporting the phone's whole attitude. Tilt is read from its
 * gravity (ADR 0014); the settle bowl's stillness hold checks the whole turn.
 * One source can feed several listeners; whoever owns it starts and stops it, the others only
 * subscribe.
 */
export interface SensorPort {
	start(): void;
	stop(): void;
	/** Returns a function that removes this listener */
	onSample(listener: (attitude: Attitude) => void): () => void;
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

/** How a catch sound plays */
export interface CatchSoundOptions {
	/** Quietens the catch (0..1, default 1), for replays such as the game-over pour */
	volume?: number;
	/**
	 * Drop the sound when every player of the effect is busy, rather than taking one over.
	 * Taking over a player is a round of native calls, so a flurry of these stalls frames.
	 */
	skipWhenBusy?: boolean;
}

/** App-lifetime audio: the game's sound effects plus the music, its lifecycle and muting */
export interface GameAudio {
	/** Load sounds; safe to call repeatedly and again after dispose */
	load(): Promise<void>;
	/** A small dot of the player's colour was caught; `pitch` raises it, in semitones (0..12) */
	playCollect(pitch: number, options?: CatchSoundOptions): void;
	/** A point dot was caught and recoloured the player; `pitch` as for playCollect */
	playLargeCollect(pitch: number, options?: CatchSoundOptions): void;
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

/**
 * The display's refresh rate. Phones that vary it go by touches, and a run has none, so they
 * fall back to their slow rate during play unless the app asks for the fast one.
 */
export interface DisplayRate {
	/** Ask for the display's fastest rate, or leave the rate to the system again */
	setFastest(fastest: boolean): void;
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

/** Which build this is, as the installed app reports it; null where the platform has no answer */
export interface BuildInfo {
	/** The marketing version, like "1.0.0" */
	version: string | null;
	/** The build number EAS stamped into the binary; local builds carry "1" */
	build: string | null;
	/** A development build, loading its JavaScript from Metro */
	dev: boolean;
}
