import { useEffect } from "react";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { type FrostWindow, NO_FROST_WINDOW } from "../effects/frost";
import { type StagePlace, type StageTransition, stageLook } from "../flow/stageLook";
import { INK_LIFT } from "../theme/theme";

/**
 * The field's look behind the screen (see stageLook.ts), applied to the values the game
 * canvas draws from: each one starts its move when the look changes it. The frost window is
 * shared with Get ready, which opens and widens it.
 */
export function useStageLook(place: StagePlace) {
	const frost = useSharedValue(0);
	const frostWindow = useSharedValue<FrostWindow>(NO_FROST_WINDOW);
	const accent = useSharedValue<string>(INK_LIFT);
	const look = stageLook(place);
	const { to: frostTo, over: frostOver } = look.frost;
	const { shutWindow } = look;
	const { to: accentTo, over: accentOver } = look.accent;

	useEffect(() => {
		if (shutWindow) frostWindow.set(NO_FROST_WINDOW);
		frost.set(moveTo(frostTo, frostOver));
	}, [frostTo, frostOver, shutWindow, frost, frostWindow]);

	useEffect(() => {
		accent.set(moveTo(accentTo, accentOver));
	}, [accentTo, accentOver, accent]);

	return { frost, frostWindow, accent };
}

/** `to`, reached as `over` says */
function moveTo<T extends number | string>(to: T, over: StageTransition): T {
	if (over.kind === "instant") return to;
	const timing = withTiming(to, { duration: over.duration });
	return over.delay > 0 ? withDelay(over.delay, timing) : timing;
}
