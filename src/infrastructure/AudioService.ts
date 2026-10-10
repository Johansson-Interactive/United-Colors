import { Asset } from "expo-asset";
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { GameAudio, MusicCue, MusicTrack } from "../application/GameAudio";
import { type Loop, MusicChannel } from "./MusicChannel";
import { SoundEffect } from "./SoundEffect";

type SoundName = "collect" | "collectLarge" | "pointSpawn" | "gameOver";

/** require() results for bundled sound files */
export type SoundSources = Record<SoundName, number>;

/** require() results for bundled music loops */
export type MusicSources = Record<MusicTrack, number>;

/** Players per effect: collects can land several in a few frames, spawns rarely overlap */
const VOICES: Record<SoundName, number> = {
	collect: 4,
	collectLarge: 3,
	pointSpawn: 2,
	gameOver: 1,
};

/**
 * Playback level per effect (0..1), so the effects sit in a deliberate mix rather than at
 * whatever level each file was mastered. Measured short-term loudness of the files (100 ms /
 * 400 ms windows): collect -11/-17 dB, large collect -7/-8 dB (a long ringing chord),
 * point spawn +1/-4 dB (legacy file, clips), game over -9/-11 dB; game music plays around
 * -22 LUFS. The small collect is the reference. The large collect lands with the same
 * punch but rings fuller; the spawn cue sits level with a collect; the game-over stinger
 * stays prominent over the ducked menu music.
 */
const VOLUME: Record<SoundName, number> = {
	collect: 1,
	collectLarge: 0.6,
	pointSpawn: 0.25,
	gameOver: 1,
};

/**
 * Sound effects and music on expo-audio. Files resolve to local URIs via expo-asset (for
 * reliable playback on Android); each effect gets a small pool of players and each music
 * track one looping player.
 */
export class AudioService implements GameAudio {
	private effects: Partial<Record<SoundName, SoundEffect>> = {};
	private music: MusicChannel | null = null;
	private musicCue: MusicCue = { track: null, volume: 0 };
	private effectsMuted = false;
	private musicMuted = false;
	private loading: Promise<void> | null = null;
	/** Bumped on dispose so a load still in flight knows its results are stale */
	private generation = 0;

	constructor(
		private readonly sources: SoundSources,
		private readonly musicSources: MusicSources,
	) {}

	load(): Promise<void> {
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
		for (const effect of Object.values(this.effects)) effect.setMuted(muted);
	}

	setMusicMuted(muted: boolean): void {
		this.musicMuted = muted;
		this.music?.setMuted(muted);
	}

	dispose(): void {
		this.generation++;
		this.loading = null;
		for (const effect of Object.values(this.effects)) effect.dispose();
		this.effects = {};
		this.music?.dispose();
		this.music = null;
	}

	private async loadAll(generation: number): Promise<void> {
		const created: Partial<Record<SoundName, SoundEffect>> = {};
		const loops: Loop[] = [];
		try {
			// Effects and music mix with the player's own music rather than taking audio focus
			// (Android) or stopping it (iOS); the in-game toggles silence each
			await setAudioModeAsync({
				playsInSilentMode: true,
				shouldPlayInBackground: false,
				interruptionMode: "mixWithOthers",
			});
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
			const music = new MusicChannel(byTrack as Record<MusicTrack, Loop>);

			for (const effect of Object.values(created)) effect.setMuted(this.effectsMuted);
			music.setMuted(this.musicMuted);
			music.setCue(this.musicCue);
			this.effects = created;
			this.music = music;
		} catch {
			// Audio unavailable (e.g. simulator) -- degrade to silence and allow a later retry
			for (const effect of Object.values(created)) effect.dispose();
			for (const loop of loops) loop.remove();
			if (generation === this.generation) this.loading = null;
		}
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
