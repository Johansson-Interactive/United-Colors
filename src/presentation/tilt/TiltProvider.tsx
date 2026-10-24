import type React from "react";
import { createContext, use, useEffect, useMemo } from "react";
import { type SharedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { FLAT_READING, type TiltReading, type TiltSource } from "../../application/TiltSource";
import { smoothTowards } from "./smoothTilt";

/**
 * Device tilt for the UI (radians, same axes and sign as the player's gyro input, so
 * anything that rolls on screen rolls the way the player dot would). `x`/`y` are the reading's
 * tilt, the very one the game gets (see TiltSource), smoothed on the UI thread every frame;
 * `reading` is the latest as it came (one shared value, so a reading is one write to the UI
 * thread). `available` flips
 * once the first real reading arrives (false on simulators without motion sensors, so
 * gyro-driven UI can fall back to tap).
 */
export interface Tilt {
	x: SharedValue<number>;
	y: SharedValue<number>;
	reading: SharedValue<TiltReading>;
	available: SharedValue<boolean>;
}

const TiltContext = createContext<Tilt | null>(null);

interface TiltProviderProps {
	source: TiltSource;
	children: React.ReactNode;
}

export const TiltProvider: React.FC<TiltProviderProps> = ({ source, children }) => {
	const reading = useSharedValue<TiltReading>(FLAT_READING);
	const x = useSharedValue(0);
	const y = useSharedValue(0);
	const available = useSharedValue(false);

	// The interface tilts on every screen, so the provider owns the source; the game only listens
	useEffect(() => {
		const unsubscribe = source.onReading((latest) => {
			reading.set(latest);
			if (!available.get()) available.set(true);
		});
		source.start();
		return () => {
			unsubscribe();
			source.stop();
		};
	}, [source, reading, available]);

	// Once the smoothed tilt snaps onto a still target, these writes repeat the same value and
	// Reanimated skips them, so nothing derived from the tilt re-runs while the phone rests
	useFrameCallback((info) => {
		const dt = info.timeSincePreviousFrame ?? 16;
		const latest = reading.get();
		x.set(smoothTowards(x.get(), latest.x, dt));
		y.set(smoothTowards(y.get(), latest.y, dt));
	});

	const value = useMemo<Tilt>(
		() => ({
			x,
			y,
			reading,
			available,
		}),
		[x, y, reading, available],
	);
	return <TiltContext value={value}>{children}</TiltContext>;
};

export function useTilt(): Tilt {
	const tilt = use(TiltContext);
	if (!tilt) throw new Error("useTilt must be used inside a TiltProvider");
	return tilt;
}
