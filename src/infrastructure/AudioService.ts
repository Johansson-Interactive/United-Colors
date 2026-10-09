import { Asset } from "expo-asset";
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPort } from "../domain/types";

/** require() result for bundling; we resolve to URI via expo-asset for reliable playback */
type AssetModule = number;

/**
 * Audio service using expo-audio.
 * Pre-loads game sounds via expo-asset (for reliable playback on Android) and plays them on demand.
 */
export class AudioService implements AudioPort {
	private enabled = true;
	private collectPlayer: AudioPlayer | null = null;
	private pointSpawnPlayer: AudioPlayer | null = null;
	private loaded = false;

	async preload(collectAsset: AssetModule, pointSpawnAsset: AssetModule): Promise<void> {
		try {
			await setAudioModeAsync({
				playsInSilentMode: true,
				shouldPlayInBackground: false,
			});

			const [collectRes, pointSpawnRes] = await Promise.all([
				Asset.loadAsync(collectAsset),
				Asset.loadAsync(pointSpawnAsset),
			]);
			const collectUri = collectRes[0]?.localUri ?? collectRes[0]?.uri ?? null;
			const pointSpawnUri = pointSpawnRes[0]?.localUri ?? pointSpawnRes[0]?.uri ?? null;
			if (!collectUri || !pointSpawnUri) {
				this.loaded = false;
				return;
			}

			this.collectPlayer = createAudioPlayer(collectUri);
			this.pointSpawnPlayer = createAudioPlayer(pointSpawnUri);
			this.loaded = true;
		} catch {
			// Audio unavailable (e.g. simulator) -- degrade gracefully
			this.loaded = false;
		}
	}

	playCollect(): void {
		if (!this.enabled || !this.loaded || !this.collectPlayer) return;
		this.collectPlayer.seekTo(0).then(() => this.collectPlayer?.play());
	}

	playPointSpawn(): void {
		if (!this.enabled || !this.loaded || !this.pointSpawnPlayer) return;
		this.pointSpawnPlayer.seekTo(0).then(() => this.pointSpawnPlayer?.play());
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	async unload(): Promise<void> {
		this.collectPlayer?.remove();
		this.pointSpawnPlayer?.remove();
		this.collectPlayer = null;
		this.pointSpawnPlayer = null;
		this.loaded = false;
	}
}
