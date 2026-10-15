import { requireOptionalNativeModule } from "expo";
import type { Corners } from "../domain/types";

interface DisplayCornersModule {
	getCornerRadius(): Promise<number | null>;
}

/** The local module in modules/display-corners; missing from a dev client built before it */
const DisplayCorners = requireOptionalNativeModule<DisplayCornersModule>("DisplayCorners");

/**
 * How the phone's glass rounds its corners: the radius the platform reports (iOS from a
 * private UIScreen key, Android 12+ from its display), drawn the platform's way, continuous
 * on iOS and circular on Android. Without the native module, or if it can't say, square
 * corners (radius 0), as on a screen that is square.
 */
export async function loadDisplayCorners(os: string): Promise<Corners> {
	const curve = os === "ios" ? "continuous" : "circular";
	try {
		const radius = await DisplayCorners?.getCornerRadius();
		if (typeof radius === "number" && Number.isFinite(radius) && radius >= 0) {
			return { radius, curve };
		}
	} catch {
		// Fall through to square corners
	}
	return { radius: 0, curve };
}
