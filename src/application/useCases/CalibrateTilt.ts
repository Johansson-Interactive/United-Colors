import type { Gravity, PoseSide } from "../../domain/types";
import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";
import { updateSettings } from "./UpdateSettings";

/**
 * Adopt `pose`, as the gravity it reads, in place of the level pose on `side`, the one in use
 * while it was set, and persist it with the other settings; the other pose is kept
 */
export function calibrateTilt(
	pose: Gravity,
	side: PoseSide,
	store: GameStore,
	storage: StoragePort,
): Promise<void> {
	const settings = store.getState().settings;
	return updateSettings(
		{ ...settings, levelPoses: { ...settings.levelPoses, [side]: pose } },
		store,
		storage,
	);
}
