import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StoragePort } from "../application/ports";
import { DEFAULT_SETTINGS, TILT_SENSITIVITY_MAX, TILT_SENSITIVITY_MIN } from "../domain/constants";
import { unitGravity } from "../domain/levelPose";
import type { GameSettings, Gravity, SavedLevelPoses } from "../domain/types";

const KEYS = {
	highScore: "@tiltling/high_score",
	settings: "@tiltling/settings",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

/** A sensitivity is a number within the range the game allows; anything else reads as default */
function readSensitivity(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.tiltSensitivity;
	if (value < TILT_SENSITIVITY_MIN || value > TILT_SENSITIVITY_MAX) {
		return DEFAULT_SETTINGS.tiltSensitivity;
	}
	return value;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * A pose is a gravity direction, three finite numbers not all zero, read back at unit length;
 * anything else (corrupt, hand-edited, an older shape) reads as unset
 */
function readPose(value: unknown): Gravity | null {
	if (!isRecord(value)) return null;
	const { x, y, z } = value;
	if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return null;
	if (Math.hypot(x, y, z) === 0) return null;
	return unitGravity({ x, y, z });
}

/**
 * Both level poses. Builds before the poses were kept together saved them as `tiltZero` and
 * `tiltZeroDown`, so those are read where the poses are missing.
 */
function readLevelPoses(stored: Record<string, unknown>): SavedLevelPoses {
	if (isRecord(stored.levelPoses)) {
		return { up: readPose(stored.levelPoses.up), down: readPose(stored.levelPoses.down) };
	}
	return { up: readPose(stored.tiltZero), down: readPose(stored.tiltZeroDown) };
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
		tiltSensitivity: readSensitivity(stored.tiltSensitivity),
		levelPoses: readLevelPoses(stored),
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
