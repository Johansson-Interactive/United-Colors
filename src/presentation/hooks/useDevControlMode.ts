import { useCallback, useEffect, useRef, useState } from "react";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

/** Dev only: 'gyro' | 'touch' | 'pending' (waiting for first gyro sample or timeout) */
type DevControlMode = "gyro" | "touch" | "pending";

const GYRO_DETECT_MS = 800;

/**
 * Dev only: prefer gyro, fall back to touch drag when no gyro sample arrives soon after a game
 * starts (e.g. on a simulator). In release builds `touch` is always false and the rest are no-ops.
 */
export function useDevControlMode() {
	const [mode, setMode] = useState<DevControlMode>("pending");
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearDetect = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		timeoutRef.current = null;
	}, []);

	/** A game started: wait briefly for gyro before switching to touch */
	const detectGyro = useCallback(() => {
		if (!isDev) return;
		setMode("pending");
		clearDetect();
		timeoutRef.current = setTimeout(() => {
			timeoutRef.current = null;
			setMode((prev) => (prev === "pending" ? "touch" : prev));
		}, GYRO_DETECT_MS);
	}, [clearDetect]);

	/** A gyro sample arrived: prefer gyro and cancel the touch fallback */
	const onGyroSample = useCallback(() => {
		if (!isDev) return;
		clearDetect();
		setMode((prev) => (prev === "pending" ? "gyro" : prev));
	}, [clearDetect]);

	useEffect(() => clearDetect, [clearDetect]);

	return { touch: isDev && mode === "touch", detectGyro, onGyroSample };
}
