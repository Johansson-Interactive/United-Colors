import { nativeApplicationVersion, nativeBuildVersion } from "expo-application";
import type { BuildInfo } from "../application/ports";

/** The build as the native app reports it: CFBundleVersion on iOS, versionCode on Android */
export function loadBuildInfo(): BuildInfo {
	return {
		version: nativeApplicationVersion,
		build: nativeBuildVersion,
		dev: typeof __DEV__ !== "undefined" && __DEV__,
	};
}
