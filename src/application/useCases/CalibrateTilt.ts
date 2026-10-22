import type { PoseSide } from "../../domain/levelPose";
import type { TiltZero } from "../../domain/types";
import type { GameStore } from "../GameStore";
import type { StoragePort } from "../ports";
import { updateSettings } from "./UpdateSettings";

/**
 * Adopt `zero` in place of the level pose on `side`, the one in use while it was set, and
 * persist it with the other settings; the other pose is kept
 */
export function calibrateTilt(
	zero: TiltZero,
	side: PoseSide,
	store: GameStore,
	storage: StoragePort,
): Promise<void> {
	const settings = store.getState().settings;
	return updateSettings(
		side === "down" ? { ...settings, tiltZeroDown: zero } : { ...settings, tiltZero: zero },
		store,
		storage,
	);
}
