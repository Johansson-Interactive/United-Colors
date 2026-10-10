import type { AudioPort } from "../domain/types";

/**
 * App-lifetime audio: the engine's sound effects plus the lifecycle and muting the engine
 * never sees. Implemented by infrastructure.
 */
export interface GameAudio extends AudioPort {
	/** Load sounds; safe to call repeatedly and again after dispose */
	load(): Promise<void>;
	/** Muting stops anything already playing and silences later plays */
	setMuted(muted: boolean): void;
	/** Release native players; an in-flight load is discarded */
	dispose(): void;
}
