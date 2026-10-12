import { AppState } from "react-native";
import type { WatchAppActive } from "../application/ports";

/** Foreground changes from React Native; "inactive" (app switcher, a call) counts as leaving */
export const watchAppActive: WatchAppActive = (listener) => {
	const subscription = AppState.addEventListener("change", (state) => listener(state === "active"));
	return () => subscription.remove();
};
