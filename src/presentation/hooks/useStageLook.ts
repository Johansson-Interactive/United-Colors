import { useEffect } from "react";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { type FrostWindow, NO_FROST_WINDOW } from "../effects/frost";
import { type StageMove, type StagePlace, stageLook } from "../effects/stageLook";
import { INK_LIFT } from "../theme/theme";

/**
 * Applies the field's look behind the screen (see stageLook.ts) to the shared values the game
 * canvas draws from. Each value starts its move only when the move itself changes, so a look
 * that stays the same restarts nothing: going between the pause and Get ready leaves alone
 * the frost window Get ready has opened. This is the only writer of the stage opacity; the
 * frost window is shared with Get ready, which opens and widens it.
 */
export function useStageLook(place: StagePlace) {
	const look = stageLook(place);
	const frostWindow = useSharedValue<FrostWindow>(NO_FROST_WINDOW);
	// Before the frost's move, so the window shuts as the frost comes on
	useEffect(() => {
		if (look.shutWindow) frostWindow.set(NO_FROST_WINDOW);
	}, [look.shutWindow, frostWindow]);
	const frost = useStageValue(0, look.frost);
	const accent = useStageValue<string>(INK_LIFT, look.accent);
	const stageOpacity = useStageValue(1, look.opacity);
	return { frost, frostWindow, accent, stageOpacity };
}

/**
 * A shared value that starts at `start` and follows `move`, starting it again only when the
 * move changes by value
 */
function useStageValue<T extends number | string>(start: T, { to, over }: StageMove<T>) {
	const value = useSharedValue<T>(start);
	const duration = over.kind === "timed" ? over.duration : undefined;
	const delay = over.kind === "timed" ? over.delay : undefined;
	useEffect(() => {
		if (duration === undefined) {
			value.set(to);
			return;
		}
		const timing = withTiming(to, { duration });
		value.set(delay ? withDelay(delay, timing) : timing);
	}, [value, to, duration, delay]);
	return value;
}
