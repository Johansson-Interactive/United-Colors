import type { AudioPlayer } from "expo-audio";

/** The slice of an expo-audio player a sound effect drives */
export type Voice = Pick<
	AudioPlayer,
	| "playing"
	| "play"
	| "pause"
	| "seekTo"
	| "remove"
	| "shouldCorrectPitch"
	| "setPlaybackRate"
	| "volume"
>;

/**
 * Where a play rewinds to (seconds): just past the start, never the start itself. Android's
 * ExoPlayer skips a seek to the position it is already at, and a voice that has never played
 * sits at 0 with its audio track released after a few idle seconds; the skipped seek leaves it
 * playing on with no track, so its first play is silent. A millisecond in, the seek is real
 * and rebuilds the track.
 */
export const REWIND_TO_S = 0.001;

/** How one play of a sound effect sounds */
export interface PlayOptions {
	/** Its volume (0..1, default 1), as a share of the effect's mix level */
	volume?: number;
	/** Drop the play when every voice is busy, rather than taking over the oldest */
	skipWhenBusy?: boolean;
}

/**
 * One sound effect backed by a small pool of players. Rapid repeats take a free voice and
 * overlap, rather than rewinding a single player that is still playing or still seeking.
 * A play can be pitched up by playing faster without pitch correction (varispeed), as far as
 * the octave a rate of 2 gives, the most expo-audio allows. Each play sets its voice's volume,
 * so a quiet play doesn't leave a pooled voice quiet for the next. When every voice is busy a
 * play takes over the oldest, unless it asks to be skipped then.
 */
export class SoundEffect {
	private cursor = 0;
	private muted = false;
	private disposed = false;
	private readonly rewinding = new Set<Voice>();

	/** `level` is the effect's mix level (0..1): the volume of a full play */
	constructor(
		private readonly voices: readonly Voice[],
		private readonly level = 1,
	) {
		for (const voice of voices) {
			voice.shouldCorrectPitch = false;
			voice.volume = level;
		}
	}

	/** Play once, raised by `pitch` semitones (0..12), at `volume` (0..1) of the mix level */
	play(pitch = 0, { volume = 1, skipWhenBusy = false }: PlayOptions = {}): void {
		if (this.muted || this.disposed) return;
		const voice = this.takeVoice(skipWhenBusy);
		if (!voice) return;
		voice.volume = this.level * volume;
		voice.setPlaybackRate(2 ** (pitch / 12));
		this.rewinding.add(voice);
		voice
			.seekTo(REWIND_TO_S)
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

	/** The next free voice in rotation; when all are busy, none if `skipWhenBusy`, else the oldest */
	private takeVoice(skipWhenBusy: boolean): Voice | undefined {
		const count = this.voices.length;
		if (count === 0) return undefined;
		let index = skipWhenBusy ? -1 : this.cursor;
		for (let i = 0; i < count; i++) {
			const candidate = (this.cursor + i) % count;
			const voice = this.voices[candidate];
			if (voice && !voice.playing && !this.rewinding.has(voice)) {
				index = candidate;
				break;
			}
		}
		if (index < 0) return undefined;
		this.cursor = (index + 1) % count;
		return this.voices[index];
	}
}
