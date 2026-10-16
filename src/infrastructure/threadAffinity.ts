import { requireOptionalNativeModule } from "expo";

interface ThreadAffinityModule {
	pinMainThreadToFastCores(): Promise<number[]>;
}

/** The local module in modules/thread-affinity (Android only); missing from older dev clients */
const ThreadAffinity = requireOptionalNativeModule<ThreadAffinityModule>("ThreadAffinity");

/**
 * Keep Android's main thread, where the worklets and Skia's renders run, on the cores faster
 * than the slowest cluster (see modules/thread-affinity). A tilt game sends no touches, so the
 * scheduler otherwise keeps that work on the little cores. Resolves the CPUs it is limited to:
 * none on iOS, without the native module, on a phone whose cores are all alike, or if the call
 * fails.
 */
export async function pinMainThreadToFastCores(os: string): Promise<number[]> {
	if (os !== "android") return [];
	try {
		const cpus = await ThreadAffinity?.pinMainThreadToFastCores();
		return Array.isArray(cpus) ? cpus : [];
	} catch {
		return [];
	}
}
