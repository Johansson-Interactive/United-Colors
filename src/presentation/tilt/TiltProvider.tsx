import type React from "react";
import { createContext, use, useEffect, useMemo } from "react";
import { type SharedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import type { TiltSource } from "../../application/TiltSource";
import type { TiltAngles } from "../../domain/types";
import { smoothTowards } from "./smoothTilt";

/**
 * Device tilt for the UI (radians, same axes and sign as the player's gyro input, so
 * anything that rolls on screen rolls the way the player dot would). `x`/`y` are the tilt the
 * game gets (see TiltSource), smoothed on the UI thread every frame. `available` flips once the
 * first real reading arrives (false on simulators without motion sensors, so gyro-driven UI can
 * fall back to tap).
 */
export interface Tilt {
	x: SharedValue<number>;
	y: SharedValue<number>;
	available: SharedValue<boolean>;
}

const LEVEL: TiltAngles = { x: 0, y: 0 };

const TiltContext = createContext<Tilt | null>(null);

interface TiltProviderProps {
	source: TiltSource;
	children: React.ReactNode;
}

export const TiltProvider: React.FC<TiltProviderProps> = ({ source, children }) => {
	// The latest tilt as it came, one shared value so a reading is one write to the UI thread
	const latest = useSharedValue<TiltAngles>(LEVEL);
	const x = useSharedValue(0);
	const y = useSharedValue(0);
	const available = useSharedValue(false);

	// The interface tilts on every screen, so the provider owns the source; the game only listens
	useEffect(() => {
		const unsubscribe = source.onReading((tilt) => {
			latest.set(tilt);
			if (!available.get()) available.set(true);
		});
		source.start();
		return () => {
			unsubscribe();
			source.stop();
		};
	}, [source, latest, available]);

	// Once the smoothed tilt snaps onto a still target, these writes repeat the same value and
	// Reanimated skips them, so nothing derived from the tilt re-runs while the phone rests
	useFrameCallback((info) => {
		const dt = info.timeSincePreviousFrame ?? 16;
		const target = latest.get();
		x.set(smoothTowards(x.get(), target.x, dt));
		y.set(smoothTowards(y.get(), target.y, dt));
	});

	const value = useMemo<Tilt>(() => ({ x, y, available }), [x, y, available]);
	return <TiltContext value={value}>{children}</TiltContext>;
};

export function useTilt(): Tilt {
	const tilt = use(TiltContext);
	if (!tilt) throw new Error("useTilt must be used inside a TiltProvider");
	return tilt;
}
