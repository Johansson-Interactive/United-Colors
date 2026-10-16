import { requireOptionalNativeModule } from "expo";
import type { DisplayRate } from "../application/ports";

interface DisplayRateModule {
	setFastest(fastest: boolean): Promise<void>;
}

/**
 * The local module in modules/display-rate. Registered on Android only, so it is missing on iOS
 * and from dev clients built before it.
 */
const NativeDisplayRate = requireOptionalNativeModule<DisplayRateModule>("DisplayRate");

/**
 * The display rate through modules/display-rate. Without the module (iOS, older dev clients),
 * or if the call fails, the system keeps choosing the rate.
 */
export class DisplayRateService implements DisplayRate {
	setFastest(fastest: boolean): void {
		NativeDisplayRate?.setFastest(fastest).catch(() => {});
	}
}
