import type React from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import { type SharedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import type { SensorPort } from "../../domain/types";

/**
 * Device tilt for the UI (radians, same axes and sign as the player's gyro input, so
 * anything that rolls on screen rolls the way the player dot would). Smoothed on the UI
 * thread every frame; `available` flips once the first real sample arrives (false on
 * simulators without motion sensors, so gyro-driven UI can fall back to tap).
 */
export interface Tilt {
	x: SharedValue<number>;
	y: SharedValue<number>;
	available: SharedValue<boolean>;
}

const TiltContext = createContext<Tilt | null>(null);

/** Fraction of the remaining distance closed per frame at 60 Hz */
const SMOOTHING = 0.18;

interface TiltProviderProps {
	sensor: SensorPort;
	children: React.ReactNode;
}

export const TiltProvider: React.FC<TiltProviderProps> = ({ sensor, children }) => {
	const rawX = useSharedValue(0);
	const rawY = useSharedValue(0);
	const x = useSharedValue(0);
	const y = useSharedValue(0);
	const available = useSharedValue(false);

	useEffect(() => {
		sensor.onSample((sample) => {
			rawX.value = sample.x;
			rawY.value = sample.y;
			if (!available.value) available.value = true;
		});
		sensor.start();
		return () => sensor.stop();
	}, [sensor, rawX, rawY, available]);

	useFrameCallback((info) => {
		const dt = info.timeSincePreviousFrame ?? 16;
		const k = 1 - (1 - SMOOTHING) ** (dt / 16.67);
		x.value += (rawX.value - x.value) * k;
		y.value += (rawY.value - y.value) * k;
	});

	const value = useMemo<Tilt>(() => ({ x, y, available }), [x, y, available]);
	return <TiltContext.Provider value={value}>{children}</TiltContext.Provider>;
};

export function useTilt(): Tilt {
	const tilt = useContext(TiltContext);
	if (!tilt) throw new Error("useTilt must be used inside a TiltProvider");
	return tilt;
}
