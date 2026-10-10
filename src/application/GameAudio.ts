import type { AudioPort } from "../domain/types";

/** The looping background tracks */
export type MusicTrack = "menu" | "game";

/** What the music should be doing: which loop, and how loud (0..1). Changes fade. */
export interface MusicCue {
	track: MusicTrack | null;
	volume: number;
}

/**
 * App-lifetime audio: the engine's sound effects plus the music, lifecycle and muting the
 * engine never sees. Implemented by infrastructure.
 */
export interface GameAudio extends AudioPort {
	/** Load sounds; safe to call repeatedly and again after dispose */
	load(): Promise<void>;
	/** Muting effects stops any already playing and silences later plays */
	setEffectsMuted(muted: boolean): void;
	/** Muting music stops the loops; unmuting resumes the current cue */
	setMusicMuted(muted: boolean): void;
	/** Fade the music towards a cue; a cue set before loading finishes applies once loaded */
	setMusic(cue: MusicCue): void;
	/** One-shot stinger when a run ends */
	playGameOver(): void;
	/** Release native players; an in-flight load is discarded */
	dispose(): void;
}
