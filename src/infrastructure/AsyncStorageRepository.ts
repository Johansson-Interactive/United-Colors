import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETTINGS } from "../domain/constants";
import type { GameSettings, StoragePort, TiltZero } from "../domain/types";

const KEYS = {
	highScore: "@united_colors/high_score",
	settings: "@united_colors/settings",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

/** A pose is two finite radians; anything else (corrupt, hand-edited, old shape) reads as unset */
function readTiltZero(value: unknown): TiltZero | null {
	if (!isRecord(value)) return null;
	const { x, y } = value;
	if (typeof x !== "number" || typeof y !== "number") return null;
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	return { x, y };
}

/**
 * Rebuild settings from whatever was persisted, field by field, falling back to the default
 * for anything missing or malformed and dropping keys the game no longer knows.
 */
function sanitizeSettings(stored: unknown): GameSettings {
	if (!isRecord(stored)) return { ...DEFAULT_SETTINGS };
	const soundEnabled = readBoolean(stored.soundEnabled, DEFAULT_SETTINGS.soundEnabled);
	// Before music had its own switch, the sound switch silenced it too
	const musicEnabled = readBoolean(stored.musicEnabled, soundEnabled);
	return {
		soundEnabled,
		musicEnabled,
		tiltZero: readTiltZero(stored.tiltZero),
		tiltZeroDown: readTiltZero(stored.tiltZeroDown),
	};
}

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
			return sanitizeSettings(JSON.parse(value));
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
