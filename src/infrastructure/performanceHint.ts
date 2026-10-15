import { requireOptionalNativeModule } from "expo";

interface PerformanceHintModule {
	start(workShare: number): Promise<boolean>;
}

/** The local module in modules/performance-hint (Android only); missing from older dev clients */
const PerformanceHint = requireOptionalNativeModule<PerformanceHintModule>("PerformanceHint");

/**
 * Share of the frame interval the UI thread's frame work is asked to fit in. Half leaves the
 * rest of the frame for the Skia renders, the window and anything late.
 */
export const FRAME_WORK_SHARE = 0.5;

/**
 * Ask Android to run the frame work on cores fast enough for it (see modules/performance-hint).
 * A tilt game gets no touch input, so without this the main thread stays on the little cores.
 * Resolves whether hinting is on: never on iOS, before Android 12, without the native module
 * or if the call fails. The module pauses itself while the app is in the background.
 */
export async function startPerformanceHint(os: string): Promise<boolean> {
	if (os !== "android") return false;
	try {
		return (await PerformanceHint?.start(FRAME_WORK_SHARE)) === true;
	} catch {
		return false;
	}
}
