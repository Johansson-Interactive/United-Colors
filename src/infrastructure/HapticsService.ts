import { ImpactFeedbackStyle, impactAsync } from "expo-haptics";
import type { GameHaptics } from "../application/GameHaptics";

/** Game haptics on expo-haptics; a device without a haptic engine stays silent */
export class HapticsService implements GameHaptics {
	spit(): void {
		impactAsync(ImpactFeedbackStyle.Heavy).catch(() => {});
	}
}
