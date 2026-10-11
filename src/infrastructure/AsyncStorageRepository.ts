import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETTINGS } from "../domain/constants";
import type { GameSettings, StoragePort } from "../domain/types";

const KEYS = {
	highScore: "@united_colors/high_score",
	settings: "@united_colors/settings",
} as const;

/**
 * Persistence layer using AsyncStorage.
 * Replaces legacy ScoreGuard (Java SharedPreferences + checksum).
 */
export class AsyncStorageRepository implements StoragePort {
	async loadHighScore(): Promise<number> {
		try {
			const value = await AsyncStorage.getItem(KEYS.highScore);
			if (value == null) return 0;
			const parsed = Number.parseInt(value, 10);
			return Number.isNaN(parsed) ? 0 : parsed;
		} catch {
			return 0;
		}
	}

	async saveHighScore(score: number): Promise<void> {
		try {
			await AsyncStorage.setItem(KEYS.highScore, String(score));
		} catch {
			// Silently fail -- non-critical
		}
	}

	async loadSettings(): Promise<GameSettings> {
		try {
			const value = await AsyncStorage.getItem(KEYS.settings);
			if (value == null) return { ...DEFAULT_SETTINGS };
			const stored: Partial<GameSettings> = JSON.parse(value);
			// Before music had its own switch, the sound switch silenced it too
			const musicEnabled = stored.musicEnabled ?? stored.soundEnabled ?? true;
			return { ...DEFAULT_SETTINGS, ...stored, musicEnabled };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	}

	async saveSettings(settings: GameSettings): Promise<void> {
		try {
			await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
		} catch {
			// Silently fail -- non-critical
		}
	}
}
