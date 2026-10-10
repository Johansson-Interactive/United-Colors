import type { AudioPlayer } from "expo-audio";

/** The slice of an expo-audio player a sound effect drives */
export type Voice = Pick<AudioPlayer, "playing" | "play" | "pause" | "seekTo" | "remove">;

/**
 * One sound effect backed by a small pool of players. Rapid repeats take a free voice and
 * overlap, rather than rewinding a single player that is still playing or still seeking.
 */
export class SoundEffect {
	private cursor = 0;
	private muted = false;
	private disposed = false;
	private readonly rewinding = new Set<Voice>();

	constructor(private readonly voices: readonly Voice[]) {}

	play(): void {
		if (this.muted || this.disposed) return;
		const voice = this.takeVoice();
		if (!voice) return;
		this.rewinding.add(voice);
		voice
			.seekTo(0)
			.then(() => {
				// Muted or torn down while rewinding: stay silent
				if (!this.muted && !this.disposed) voice.play();
			})
			.catch(() => {})
			.finally(() => this.rewinding.delete(voice));
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		if (!muted) return;
		for (const voice of this.voices) {
			try {
				voice.pause();
			} catch {
				// Player already released natively
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		for (const voice of this.voices) {
			try {
				voice.remove();
			} catch {
				// Player already released natively
			}
		}
	}

	/** The next free voice in rotation, or the oldest one when all are busy */
	private takeVoice(): Voice | undefined {
		const count = this.voices.length;
		if (count === 0) return undefined;
		let index = this.cursor;
		for (let i = 0; i < count; i++) {
			const candidate = (this.cursor + i) % count;
			const voice = this.voices[candidate];
			if (voice && !voice.playing && !this.rewinding.has(voice)) {
				index = candidate;
				break;
			}
		}
		this.cursor = (index + 1) % count;
		return this.voices[index];
	}
}
