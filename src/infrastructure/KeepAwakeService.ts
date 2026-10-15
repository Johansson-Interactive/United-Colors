import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import type { ScreenAwake } from "../application/ports";

/** Own tag, so releasing ours never drops the dev client's keep-awake */
const TAG = "tiltling-run";

/** Screen keep-awake on expo-keep-awake; a failure only means the screen may dim */
export class KeepAwakeService implements ScreenAwake {
	setAwake(awake: boolean): void {
		const request = awake ? activateKeepAwakeAsync(TAG) : deactivateKeepAwake(TAG);
		request.catch(() => {});
	}
}
