import type { AudioPlayer } from "expo-audio";
import type { MusicCue, MusicTrack } from "../application/GameAudio";

/** The slice of an expo-audio player a music loop drives */
export type Loop = Pick<AudioPlayer, "loop" | "volume" | "play" | "pause" | "seekTo" | "remove">;

/** Volume steps run on a timer: expo-audio has no native fades */
const STEP_MS = 50;
/** Time for a full 0 -> 1 rise; quicker for the way down so a new track is never muddy */
const FADE_IN_MS = 1200;
const FADE_OUT_MS = 500;

/**
 * Background music: one looping player per track, crossfaded towards the current cue.
 * A track that fades out pauses and rewinds, so the next time it comes in it starts from
 * the top; a track that only changes volume (ducking on pause) keeps its place.
 */
export class MusicChannel {
	private cue: MusicCue = { track: null, volume: 0 };
	private readonly levels = new Map<MusicTrack, number>();
	private readonly running = new Set<MusicTrack>();
	private timer: ReturnType<typeof setInterval> | null = null;
	private muted = false;
	private disposed = false;

	constructor(private readonly loops: Record<MusicTrack, Loop>) {
		for (const track of this.tracks()) {
			const loop = this.loops[track];
			loop.loop = true;
			loop.volume = 0;
			this.levels.set(track, 0);
		}
	}

	setCue(cue: MusicCue): void {
		this.cue = { track: cue.track, volume: clamp01(cue.volume) };
		this.fade();
	}

	/** Muting pauses in place; unmuting fades the current cue back in */
	setMuted(muted: boolean): void {
		this.muted = muted;
		if (!muted) {
			this.fade();
			return;
		}
		this.stopTimer();
		for (const track of this.tracks()) {
			this.levels.set(track, 0);
			this.call(track, (loop) => {
				loop.volume = 0;
				loop.pause();
			});
		}
		this.running.clear();
	}

	dispose(): void {
		this.disposed = true;
		this.stopTimer();
		for (const track of this.tracks()) this.call(track, (loop) => loop.remove());
		this.running.clear();
	}

	private fade(): void {
		if (this.muted || this.disposed || this.timer) return;
		this.timer = setInterval(() => this.step(), STEP_MS);
		this.step();
	}

	private step(): void {
		let settled = true;
		for (const track of this.tracks()) {
			const target = track === this.cue.track ? this.cue.volume : 0;
			const level = this.levels.get(track) ?? 0;
			if (target > 0 && !this.running.has(track)) {
				this.running.add(track);
				this.call(track, (loop) => loop.play());
			}
			const next =
				target > level
					? Math.min(target, level + STEP_MS / FADE_IN_MS)
					: Math.max(target, level - STEP_MS / FADE_OUT_MS);
			if (next !== level) {
				this.levels.set(track, next);
				this.call(track, (loop) => {
					loop.volume = next;
				});
			}
			if (next === 0 && this.running.has(track)) {
				this.running.delete(track);
				this.call(track, (loop) => {
					loop.pause();
					loop.seekTo(0).catch(() => {});
				});
			}
			if (next !== target) settled = false;
		}
		if (settled) this.stopTimer();
	}

	private stopTimer(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	private tracks(): MusicTrack[] {
		return Object.keys(this.loops) as MusicTrack[];
	}

	private call(track: MusicTrack, action: (loop: Loop) => void): void {
		try {
			action(this.loops[track]);
		} catch {
			// Player already released natively
		}
	}
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}
