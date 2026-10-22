import { useEffect } from "react";
import {
	type SharedValue,
	useDerivedValue,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { FROSTED_ALL, type FrostEdge } from "../effects/frost";
import { type StageMove, type StagePlace, stageLook } from "../effects/stageLook";
import { INK_LIFT } from "../theme/theme";

/**
 * Applies the field's look behind the screen (see stageLook.ts) to the shared values the game
 * canvas draws from. Each value starts its move only when the move itself changes, so a look
 * that stays the same restarts nothing: going between the pause and Get ready leaves alone
 * the frost edge Get ready has opened. This is the only writer of the stage opacity; the
 * frost edge is shared with the bloom and Get ready, which move it. A wash in the player's
 * colour follows `playerColor` on the UI thread, so a colour switch in play renders nothing.
 */
export function useStageLook(place: StagePlace, playerColor: SharedValue<string>) {
	const look = stageLook(place);
	const frostEdge = useSharedValue<FrostEdge>(FROSTED_ALL);
	// Before the frost's move, so the edge is frosted all over as the pause's or the game over's frost comes on
	useEffect(() => {
		if (look.shutWindow) frostEdge.set(FROSTED_ALL);
	}, [look.shutWindow, frostEdge]);
	const frost = useStageValue(0, look.frost);
	const washInPlayer = look.accent === "player";
	const accent = useDerivedValue(() => (washInPlayer ? playerColor.get() : INK_LIFT));
	const stageOpacity = useStageValue(1, look.opacity);
	return { frost, frostEdge, accent, stageOpacity };
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
