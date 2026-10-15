import { useFrameCallback, useSharedValue } from "react-native-reanimated";

/** Frames between reports */
const REPORT_FRAMES = 300;

interface HermesStats {
	js_totalAllocatedBytes?: number;
	js_numGCs?: number;
	js_externalBytes?: number;
}

/**
 * For the bench run (see application/bench.ts): every REPORT_FRAMES frames, log what the UI
 * runtime allocated per frame, how many garbage collections it ran and the native memory its
 * objects report, from Hermes's own counters (in logcat, tag ReactNativeJS, "[bench]"). A
 * collection on the UI runtime stalls the frame it lands in, so these are the numbers that
 * show whether a change makes the UI thread collect more often.
 */
export function useBenchStats(enabled: boolean): void {
	const frames = useSharedValue(0);
	const lastBytes = useSharedValue(-1);
	const lastGCs = useSharedValue(0);
	useFrameCallback(() => {
		frames.set(frames.get() + 1);
		if (frames.get() % REPORT_FRAMES !== 0) return;
		const hermes = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => HermesStats } })
			.HermesInternal;
		const stats = hermes?.getInstrumentedStats?.();
		const bytes = stats?.js_totalAllocatedBytes ?? 0;
		const gcs = stats?.js_numGCs ?? 0;
		if (lastBytes.get() >= 0) {
			const perFrame = Math.round((bytes - lastBytes.get()) / REPORT_FRAMES);
			const external = Math.round((stats?.js_externalBytes ?? 0) / 1024);
			console.log(
				`[bench] ui runtime: ${perFrame} B/frame allocated, ${gcs - lastGCs.get()} GCs in ${REPORT_FRAMES} frames, ${external} KB external`,
			);
		}
		lastBytes.set(bytes);
		lastGCs.set(gcs);
	}, enabled);
}
