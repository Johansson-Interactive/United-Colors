import { useEffect } from "react";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { type FrostWindow, NO_FROST_WINDOW } from "../effects/frost";
import { type StagePlace, type StageTransition, stageLook } from "../effects/stageLook";
import { INK_LIFT } from "../theme/theme";

/**
 * The field's look behind the screen (see stageLook.ts), applied to the values the game
 * canvas draws from: each one starts its move when the look changes it. This is the only
 * writer of the stage opacity. The frost window is
 * shared with Get ready, which opens and widens it.
 */
export function useStageLook(place: StagePlace) {
	const frost = useSharedValue(0);
	const frostWindow = useSharedValue<FrostWindow>(NO_FROST_WINDOW);
	const accent = useSharedValue<string>(INK_LIFT);
	const stageOpacity = useSharedValue(1);
	const look = stageLook(place);
	const { to: frostTo, over: frostOver } = look.frost;
	const { shutWindow } = look;
	const { to: accentTo, over: accentOver } = look.accent;
	const { to: opacityTo, over: opacityOver } = look.opacity;

	useEffect(() => {
		if (shutWindow) frostWindow.set(NO_FROST_WINDOW);
		frost.set(moveTo(frostTo, frostOver));
	}, [frostTo, frostOver, shutWindow, frost, frostWindow]);

	useEffect(() => {
		accent.set(moveTo(accentTo, accentOver));
	}, [accentTo, accentOver, accent]);

	useEffect(() => {
		stageOpacity.set(moveTo(opacityTo, opacityOver));
	}, [opacityTo, opacityOver, stageOpacity]);

	return { frost, frostWindow, accent, stageOpacity };
}

/** `to`, reached as `over` says */
function moveTo<T extends number | string>(to: T, over: StageTransition): T {
	if (over.kind === "instant") return to;
	const timing = withTiming(to, { duration: over.duration });
	return over.delay > 0 ? withDelay(over.delay, timing) : timing;
}
