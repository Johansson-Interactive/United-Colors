import { Asset } from "expo-asset";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { GameAudio } from "../application/GameAudio";
import { SoundEffect, type Voice } from "./SoundEffect";

type SoundName = "collect" | "pointSpawn";

/** require() results for bundled sound files */
export type SoundSources = Record<SoundName, number>;

/** Players per effect: collects can land several in a few frames, spawns rarely overlap */
const VOICES: Record<SoundName, number> = {
	collect: 4,
	pointSpawn: 2,
};

/**
 * Sound effects on expo-audio. Sounds resolve to local files via expo-asset (for reliable
 * playback on Android) and each effect gets a small pool of players.
 */
export class AudioService implements GameAudio {
	private effects: Partial<Record<SoundName, SoundEffect>> = {};
	private muted = false;
	private loading: Promise<void> | null = null;
	/** Bumped on dispose so a load still in flight knows its results are stale */
	private generation = 0;

	constructor(private readonly sources: SoundSources) {}

	load(): Promise<void> {
		this.loading ??= this.loadEffects(this.generation);
		return this.loading;
	}

	playCollect(): void {
		this.effects.collect?.play();
	}

	playPointSpawn(): void {
		this.effects.pointSpawn?.play();
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		for (const effect of Object.values(this.effects)) effect.setMuted(muted);
	}

	dispose(): void {
		this.generation++;
		this.loading = null;
		for (const effect of Object.values(this.effects)) effect.dispose();
		this.effects = {};
	}

	private async loadEffects(generation: number): Promise<void> {
		const created: Partial<Record<SoundName, SoundEffect>> = {};
		try {
			// Sound effects mix with the player's own music rather than taking audio focus
			// (Android) or stopping it (iOS) on every play
			await setAudioModeAsync({
				playsInSilentMode: true,
				shouldPlayInBackground: false,
				interruptionMode: "mixWithOthers",
			});
			const names = Object.keys(this.sources) as SoundName[];
			const uris = await Promise.all(names.map((name) => resolveUri(this.sources[name])));
			if (generation !== this.generation) return;

			names.forEach((name, i) => {
				created[name] = new SoundEffect(createVoices(uris[i], VOICES[name]));
			});
			for (const effect of Object.values(created)) effect.setMuted(this.muted);
			this.effects = created;
		} catch {
			// Audio unavailable (e.g. simulator) -- degrade to silence and allow a later retry
			for (const effect of Object.values(created)) effect.dispose();
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

function createVoices(uri: string | undefined, count: number): Voice[] {
	if (!uri) throw new Error("Sound asset has no URI");
	const voices: Voice[] = [];
	try {
		for (let i = 0; i < count; i++) {
			// Keeping the iOS session active avoids deactivating it after every short sound,
			// which races the next play and costs a session round trip each time
			voices.push(createAudioPlayer(uri, { keepAudioSessionActive: true }));
		}
	} catch (error) {
		for (const voice of voices) voice.remove();
		throw error;
	}
	return voices;
}
