import type React from "react";
import { createContext, use, useEffect, useMemo } from "react";
import { type SharedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import type { SensorPort, SensorSample } from "../../application/ports";
import {
	FLAT_ATTITUDES,
	type LevelAttitudes,
	levelTilt,
	type PoseSide,
} from "../../domain/levelPose";
import { smoothTowards } from "./smoothTilt";

/**
 * Device tilt for the UI (radians, same axes and sign as the player's gyro input, so
 * anything that rolls on screen rolls the way the player dot would). `x`/`y` are the whole
 * turn from the nearer level pose, as the game measures them (see levelTilt), and smoothed
 * on the UI thread every frame; `raw` is the latest sample as the sensor gave it, the attitude,
 * for setting that pose (one shared value, so a sample is one write to the UI thread). `available`
 * flips once the first real sample arrives (false on simulators without motion sensors, so
 * gyro-driven UI can fall back to tap).
 */
export interface Tilt {
	x: SharedValue<number>;
	y: SharedValue<number>;
	raw: SharedValue<SensorSample>;
	/**
	 * The poses that read as level, swivel zeroed; the game screen keeps them in step with the
	 * game's (see bindTiltZero)
	 */
	poses: SharedValue<LevelAttitudes>;
	/** The level pose `x`/`y` are measured from */
	side: SharedValue<PoseSide>;
	available: SharedValue<boolean>;
}

const TiltContext = createContext<Tilt | null>(null);

interface TiltProviderProps {
	sensor: SensorPort;
	children: React.ReactNode;
}

export const TiltProvider: React.FC<TiltProviderProps> = ({ sensor, children }) => {
	const rawSample = useSharedValue<SensorSample>(FLAT_ATTITUDES.up);
	const poses = useSharedValue<LevelAttitudes>(FLAT_ATTITUDES);
	const side = useSharedValue<PoseSide>("up");
	const x = useSharedValue(0);
	const y = useSharedValue(0);
	const available = useSharedValue(false);

	// The interface tilts on every screen, so the provider owns the sensor; the game only listens
	useEffect(() => {
		const unsubscribe = sensor.onSample((sample) => {
			rawSample.set(sample);
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
		const tilt = levelTilt(rawSample.get(), poses.get(), side.get());
		side.set(tilt.side);
		x.set(smoothTowards(x.get(), tilt.x, dt));
		y.set(smoothTowards(y.get(), tilt.y, dt));
	});

	const value = useMemo<Tilt>(
		() => ({
			x,
			y,
			raw: rawSample,
			poses,
			side,
			available,
		}),
		[x, y, rawSample, poses, side, available],
	);
	return <TiltContext value={value}>{children}</TiltContext>;
};

export function useTilt(): Tilt {
	const tilt = use(TiltContext);
	if (!tilt) throw new Error("useTilt must be used inside a TiltProvider");
	return tilt;
}
