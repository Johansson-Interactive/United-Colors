import type React from "react";
import { createContext, use, useEffect, useMemo } from "react";
import { type SharedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import type { SensorPort, TiltZero } from "../../domain/types";

/**
 * Device tilt for the UI (radians, same axes and sign as the player's gyro input, so
 * anything that rolls on screen rolls the way the player dot would). `x`/`y` are measured
 * from the level pose for the side the screen faces and smoothed on the UI thread every frame;
 * `raw` is the latest sample as the sensor gave it, for setting that pose. `available` flips once the first real sample
 * arrives (false on simulators without motion sensors, so gyro-driven UI can fall back to tap).
 */
export interface Tilt {
	x: SharedValue<number>;
	y: SharedValue<number>;
	raw: { x: SharedValue<number>; y: SharedValue<number>; facingDown: SharedValue<boolean> };
	/** The pose that reads as level; the game screen keeps it in step with settings */
	zero: SharedValue<TiltZero>;
	/** The same with the screen facing down */
	zeroDown: SharedValue<TiltZero>;
	available: SharedValue<boolean>;
}

export const NO_ZERO: TiltZero = { x: 0, y: 0 };

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
	const rawFacingDown = useSharedValue(false);
	const zero = useSharedValue<TiltZero>(NO_ZERO);
	const zeroDown = useSharedValue<TiltZero>(NO_ZERO);
	const x = useSharedValue(0);
	const y = useSharedValue(0);
	const available = useSharedValue(false);

	useEffect(() => {
		sensor.onSample((sample) => {
			rawX.set(sample.x);
			rawY.set(sample.y);
			rawFacingDown.set(sample.facingDown);
			if (!available.value) available.set(true);
		});
		sensor.start();
		return () => sensor.stop();
	}, [sensor, rawX, rawY, rawFacingDown, available]);

	useFrameCallback((info) => {
		const dt = info.timeSincePreviousFrame ?? 16;
		const k = 1 - (1 - SMOOTHING) ** (dt / 16.67);
		const level = rawFacingDown.value ? zeroDown.value : zero.value;
		x.set(x.get() + (rawX.value - level.x - x.value) * k);
		y.set(y.get() + (rawY.value - level.y - y.value) * k);
	});

	const value = useMemo<Tilt>(
		() => ({
			x,
			y,
			raw: { x: rawX, y: rawY, facingDown: rawFacingDown },
			zero,
			zeroDown,
			available,
		}),
		[x, y, rawX, rawY, rawFacingDown, zero, zeroDown, available],
	);
	return <TiltContext value={value}>{children}</TiltContext>;
};

export function useTilt(): Tilt {
	const tilt = use(TiltContext);
	if (!tilt) throw new Error("useTilt must be used inside a TiltProvider");
	return tilt;
}
