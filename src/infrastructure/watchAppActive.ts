import { AppState } from "react-native";
import type { WatchAppActive } from "../application/ports";

/** Foreground changes from React Native; "inactive" (app switcher, a call) counts as leaving */
export const watchAppActive: WatchAppActive = (listener) => {
	const subscription = AppState.addEventListener("change", (state) => listener(state === "active"));
	return () => subscription.remove();
};

/**
 * Background (false) and back (true). iOS's "inactive" (Control Center, a banner) keeps the
 * app in the foreground, so it reports nothing, and the "active" after it reports true again.
 */
export function watchAppForeground(listener: (foreground: boolean) => void): () => void {
	const subscription = AppState.addEventListener("change", (state) => {
		if (state !== "inactive") listener(state === "active");
	});
	return () => subscription.remove();
}
