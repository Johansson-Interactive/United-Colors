import { Asset } from "expo-asset";
import { type AudioMode, type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { GameAudio, MusicCue, MusicTrack } from "../application/ports";
import { type Loop, MusicChannel } from "./MusicChannel";
import { SoundEffect } from "./SoundEffect";

type SoundName = "collect" | "collectLarge" | "pointSpawn" | "gameOver";

/** require() results for bundled sound files */
export type SoundSources = Record<SoundName, number>;

/** require() results for bundled music loops */
export type MusicSources = Record<MusicTrack, number>;

/** What the service needs from the device besides expo-audio */
export interface AudioHost {
	/** Platform.OS */
	os: string;
	/**
	 * Whether another app is playing audio the music should give way to. Android counts this
	 * app's own playback too, so it is only read while the music is silent.
	 */
	isOtherAudioPlaying: () => boolean;
	/** Background (false) and back (true); returns the unsubscribe */
	watchForeground: (listener: (foreground: boolean) => void) => () => void;
}

/** Players per effect: collects can land several in a few frames, spawns rarely overlap */
const VOICES: Record<SoundName, number> = {
	collect: 4,
	collectLarge: 3,
	pointSpawn: 2,
	gameOver: 1,
};

/**
 * Playback level per effect (0..1). The files are peak-normalised (scripts/mastering.py), so
 * these set the mix, judged by perceived loudness (ISO 532-1, Zwicker) against the game loop
 * at its RUNNING cue, on headphones and through a phone speaker's bass roll-off. The tick sits
 * a little under the music on headphones and level with it on a speaker, where the bass of
 * the music is lost; the point-dot chime lands about 3 phon above the tick, a bigger catch
 * rather than a jump in volume; the spawn cue matches the tick (it is a low sound, so a
 * speaker plays it softer); the game-over stinger rings out over the ducked menu loop.
 */
const VOLUME: Record<SoundName, number> = {
	collect: 0.95,
	collectLarge: 0.45,
	pointSpawn: 0.6,
	gameOver: 1,
};

/** How often to look again while the music gives way to another app's audio */
const OTHER_AUDIO_RECHECK_MS = 2000;

/**
 * The audio session. Both platforms mix with other apps rather than stopping them. iOS uses
 * the Ambient category Apple asks of games, so the Ring/Silent switch silences the game.
 * Android has no such switch (vibrate mode doesn't ask games to go quiet), and leaves
 * backgrounding to this service: expo-audio would otherwise resume the music by itself on
 * return, before the service can check whether another app is playing.
 */
function audioModeFor(os: string): Partial<AudioMode> {
	const ios = os === "ios";
	return {
		interruptionMode: "mixWithOthers",
		playsInSilentMode: !ios,
		shouldPlayInBackground: !ios,
	};
}

/**
 * Sound effects and music on expo-audio. Files resolve to local URIs via expo-asset (for
 * reliable playback on Android); each effect gets a small pool of players and each music
 * track one looping player.
 *
 * Following Apple's guidance for games, the music gives way when the player already has
 * other audio going (their own music, a podcast): it stays silent while that plays and fades
 * in once it stops. The effects keep playing over it. Everything is silent in the background.
 */
export class AudioService implements GameAudio {
	private effects: Partial<Record<SoundName, SoundEffect>> = {};
	private music: MusicChannel | null = null;
	private musicCue: MusicCue = { track: null, volume: 0 };
	private effectsMuted = false;
	private musicMuted = false;
	private away = false;
	private otherAudio = false;
	private recheck: ReturnType<typeof setInterval> | null = null;
	private unwatch: (() => void) | null = null;
	private loading: Promise<void> | null = null;
	/** Bumped on dispose so a load still in flight knows its results are stale */
	private generation = 0;

	constructor(
		private readonly sources: SoundSources,
		private readonly musicSources: MusicSources,
		private readonly host: AudioHost,
	) {}

	load(): Promise<void> {
		this.unwatch ??= this.host.watchForeground((foreground) => this.setForeground(foreground));
		this.loading ??= this.loadAll(this.generation);
		return this.loading;
	}

	playCollect(): void {
		this.effects.collect?.play();
	}

	playLargeCollect(): void {
		this.effects.collectLarge?.play();
	}

	playPointSpawn(): void {
		this.effects.pointSpawn?.play();
	}

	playGameOver(): void {
		this.effects.gameOver?.play();
	}

	setMusic(cue: MusicCue): void {
		this.musicCue = cue;
		this.music?.setCue(cue);
	}

	setEffectsMuted(muted: boolean): void {
		this.effectsMuted = muted;
		this.applyEffects();
	}

	setMusicMuted(muted: boolean): void {
		this.musicMuted = muted;
		this.applyMusic();
	}

	dispose(): void {
		this.generation++;
		this.loading = null;
		this.unwatch?.();
		this.unwatch = null;
		this.stopRecheck();
		this.away = false;
		this.otherAudio = false;
		for (const effect of Object.values(this.effects)) effect.dispose();
		this.effects = {};
		this.music?.dispose();
		this.music = null;
	}

	private async loadAll(generation: number): Promise<void> {
		const created: Partial<Record<SoundName, SoundEffect>> = {};
		const loops: Loop[] = [];
		try {
			await setAudioModeAsync(audioModeFor(this.host.os));
			const names = Object.keys(this.sources) as SoundName[];
			const tracks = Object.keys(this.musicSources) as MusicTrack[];
			const [uris, trackUris] = await Promise.all([
				Promise.all(names.map((name) => resolveUri(this.sources[name]))),
				Promise.all(tracks.map((track) => resolveUri(this.musicSources[track]))),
			]);
			if (generation !== this.generation) return;

			names.forEach((name, i) => {
				created[name] = new SoundEffect(createPlayers(uris[i], VOICES[name], VOLUME[name]));
			});
			const byTrack: Partial<Record<MusicTrack, Loop>> = {};
			tracks.forEach((track, i) => {
				const [loop] = createPlayers(trackUris[i], 1);
				if (loop) loops.push(loop);
				byTrack[track] = loop;
			});

			// Nothing of ours has played yet, so this sees only other apps
			this.otherAudio = this.host.isOtherAudioPlaying();
			this.effects = created;
			this.music = new MusicChannel(byTrack as Record<MusicTrack, Loop>);
			this.applyEffects();
			this.applyMusic();
			this.music.setCue(this.musicCue);
		} catch {
			// Audio unavailable (e.g. simulator) -- degrade to silence and allow a later retry
			for (const effect of Object.values(created)) effect.dispose();
			for (const loop of loops) loop.remove();
			if (generation === this.generation) this.loading = null;
		}
	}

	/**
	 * Silence everything in the background. Coming back, look for other audio before the
	 * music starts again, while it is still silent from the background as Android's check
	 * needs. iOS's check ignores this app's own audio, so a return from Control Center, where
	 * the player may have started their music, can look while the music plays.
	 */
	private setForeground(foreground: boolean): void {
		if (foreground) this.otherAudio = this.host.isOtherAudioPlaying();
		this.away = !foreground;
		this.applyEffects();
		this.applyMusic();
	}

	private applyEffects(): void {
		const muted = this.effectsMuted || this.away;
		for (const effect of Object.values(this.effects)) effect.setMuted(muted);
	}

	/** Also re-pauses music expo-audio may have resumed by itself on return (iOS) */
	private applyMusic(): void {
		if (!this.music) return;
		this.music.setMuted(this.musicMuted || this.away || this.otherAudio);
		const waiting = this.otherAudio && !this.musicMuted && !this.away;
		if (waiting && !this.recheck) {
			this.recheck = setInterval(() => this.recheckOtherAudio(), OTHER_AUDIO_RECHECK_MS);
		} else if (!waiting) {
			this.stopRecheck();
		}
	}

	/** The music is silent while it waits, so the check sees only other apps */
	private recheckOtherAudio(): void {
		if (this.host.isOtherAudioPlaying()) return;
		this.otherAudio = false;
		this.applyMusic();
	}

	private stopRecheck(): void {
		if (this.recheck) clearInterval(this.recheck);
		this.recheck = null;
	}
}

async function resolveUri(source: number): Promise<string> {
	const [asset] = await Asset.loadAsync(source);
	const uri = asset?.localUri ?? asset?.uri;
	if (!uri) throw new Error("Sound asset has no URI");
	return uri;
}

function createPlayers(uri: string | undefined, count: number, volume = 1): AudioPlayer[] {
	if (!uri) throw new Error("Sound asset has no URI");
	const voices: AudioPlayer[] = [];
	try {
		for (let i = 0; i < count; i++) {
			// Keeping the iOS session active avoids deactivating it after every short sound,
			// which races the next play and costs a session round trip each time
			const voice = createAudioPlayer(uri, { keepAudioSessionActive: true });
			voices.push(voice);
			voice.volume = volume;
		}
	} catch (error) {
		for (const voice of voices) voice.remove();
		throw error;
	}
	return voices;
}
