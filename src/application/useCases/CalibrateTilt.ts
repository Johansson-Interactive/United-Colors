import type { TiltZero } from "../../domain/types";
import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";
import { updateSettings } from "./UpdateSettings";

/**
 * Adopt `zero` in place of the level pose that was in use while it was set (screen up, or
 * `facingDown`: turned over), and persist it with the other settings; the other pose is kept
 */
export function calibrateTilt(
	zero: TiltZero,
	store: GameStore,
	storage: StoragePort,
	facingDown = false,
): Promise<void> {
	const settings = store.getState().settings;
	return updateSettings(
		facingDown ? { ...settings, tiltZeroDown: zero } : { ...settings, tiltZero: zero },
		store,
		storage,
	);
}
