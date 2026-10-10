import type { StoragePort, TiltZero } from "../../domain/types";
import type { GameStore } from "../GameStore";
import { updateSettings } from "./UpdateSettings";

/** Adopt `zero` as the level pose and persist it with the other settings */
export function calibrateTilt(
	zero: TiltZero,
	store: GameStore,
	storage: StoragePort,
): Promise<void> {
	return updateSettings({ ...store.getState().settings, tiltZero: zero }, store, storage);
}
