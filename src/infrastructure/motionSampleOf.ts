import type { DeviceMotionMeasurement } from "expo-sensors";
import type { MotionSample, Vector3 } from "../domain/types";
import { gravityFromRotation } from "./gravityFromRotation";

/** The platforms Expo's device motion differs on */
export type MotionPlatform = "ios" | "android";

const STILL: Vector3 = { x: 0, y: 0, z: 0 };

const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * The gyroscope's rate in the phone's axes (radians a second). Expo reports degrees a second
 * under alpha, beta and gamma, but names the axes differently on each platform: iOS puts the
 * turn about z under alpha and about x under gamma, Android the other way round.
 */
function rotationRateOf(
	rate: DeviceMotionMeasurement["rotationRate"],
	platform: MotionPlatform,
): Vector3 {
	if (!rate) return STILL;
	const [x, y, z] =
		platform === "ios" ? [rate.gamma, rate.beta, rate.alpha] : [rate.alpha, rate.beta, rate.gamma];
	return { x: x * RADIANS_PER_DEGREE, y: y * RADIANS_PER_DEGREE, z: z * RADIANS_PER_DEGREE };
}

/** One Expo device-motion event as a sample in the phone's own axes, the same on both platforms */
export function motionSampleOf(
	data: DeviceMotionMeasurement,
	platform: MotionPlatform,
): MotionSample {
	return {
		gravity: gravityFromRotation(data.rotation.beta, data.rotation.gamma),
		rotationRate: rotationRateOf(data.rotationRate, platform),
		timeMs: data.rotation.timestamp * 1000,
	};
}
