import type { TiltZero } from "../../domain/types";
import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";
import { updateSettings } from "./UpdateSettings";

/**
 * Adopt `zero` as the level pose for the side the screen faced while it was set, and persist
 * it with the other settings; the other side's pose is kept
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
