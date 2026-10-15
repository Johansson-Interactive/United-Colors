import type React from "react";
import { createContext, use, useEffect, useMemo } from "react";
import { type SharedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import type { SensorPort, SensorSample } from "../../application/ports";
import type { TiltZero } from "../../domain/types";
import { smoothTowards } from "./smoothTilt";
import { NO_ZERO } from "./tiltZero";

/**
 * Device tilt for the UI (radians, same axes and sign as the player's gyro input, so
 * anything that rolls on screen rolls the way the player dot would). `x`/`y` are measured
 * from the level pose for the side the screen faces and smoothed on the UI thread every frame;
 * `raw` is the latest sample as the sensor gave it, for setting that pose (one shared value, so
 * a sample is one write to the UI thread). `available` flips once the first real sample
 * arrives (false on simulators without motion sensors, so gyro-driven UI can fall back to tap).
 */
export interface Tilt {
	x: SharedValue<number>;
	y: SharedValue<number>;
	raw: SharedValue<SensorSample>;
	/** The pose that reads as level; the game screen keeps it in step with settings */
	zero: SharedValue<TiltZero>;
	/** The same with the screen facing down */
	zeroDown: SharedValue<TiltZero>;
	available: SharedValue<boolean>;
}

const TiltContext = createContext<Tilt | null>(null);

interface TiltProviderProps {
	sensor: SensorPort;
	children: React.ReactNode;
}

export const TiltProvider: React.FC<TiltProviderProps> = ({ sensor, children }) => {
	const rawSample = useSharedValue<SensorSample>({ x: 0, y: 0, facingDown: false });
	const zero = useSharedValue<TiltZero>(NO_ZERO);
	const zeroDown = useSharedValue<TiltZero>(NO_ZERO);
	const x = useSharedValue(0);
	const y = useSharedValue(0);
	const available = useSharedValue(false);

	// The interface tilts on every screen, so the provider owns the sensor; the game only listens
	useEffect(() => {
		const unsubscribe = sensor.onSample((sample) => {
			rawSample.set({ x: sample.x, y: sample.y, facingDown: sample.facingDown });
			if (!available.get()) available.set(true);
		});
		sensor.start();
		return () => {
			unsubscribe();
			sensor.stop();
		};
	}, [sensor, rawSample, available]);

	// Once the smoothed tilt snaps onto a still target, these writes repeat the same value and
	// Reanimated skips them, so nothing derived from the tilt re-runs while the phone rests
	useFrameCallback((info) => {
		const dt = info.timeSincePreviousFrame ?? 16;
		const raw = rawSample.get();
		const level = raw.facingDown ? zeroDown.get() : zero.get();
		x.set(smoothTowards(x.get(), raw.x - level.x, dt));
		y.set(smoothTowards(y.get(), raw.y - level.y, dt));
	});

	const value = useMemo<Tilt>(
		() => ({
			x,
			y,
			raw: rawSample,
			zero,
			zeroDown,
			available,
		}),
		[x, y, rawSample, zero, zeroDown, available],
	);
	return <TiltContext value={value}>{children}</TiltContext>;
};

export function useTilt(): Tilt {
	const tilt = use(TiltContext);
	if (!tilt) throw new Error("useTilt must be used inside a TiltProvider");
	return tilt;
}
