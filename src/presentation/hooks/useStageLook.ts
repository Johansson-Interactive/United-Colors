import { rect, rrect } from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import {
	type SharedValue,
	useDerivedValue,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import type { PortalCut } from "../components/PlaySide";
import { PAUSE_ALL, PLAY_ALL, type Portal, playShows } from "../effects/portal";
import { type StageMove, type StagePlace, stageLook } from "../effects/stageLook";
import { INK_LIFT } from "../theme/theme";

/**
 * Applies the field's look behind the screen (see stageLook.ts) to the shared values the
 * canvases draw from. Each value starts its move only when the move itself changes, so a look
 * that stays the same restarts nothing: going between the pause and Get ready leaves alone
 * the portal Get ready has opened. This is the only writer of the stage opacity; the
 * portal is shared with the bloom and Get ready, which move it. A wash in the player's
 * colour follows `playerColor` on the UI thread, so a colour switch in play renders nothing.
 *
 * Every canvas on the play side cuts itself to the same portal while the pause world is under
 * it: `cut` holds the portal's circle and whether the play side shows outside it rather than
 * inside (see playShows), worked out once a frame for all of the canvases and only while the
 * portal moves. It is null in play, which is cut nowhere, and the same object otherwise, so no
 * canvas sees a new cut each render.
 */
export function useStageLook(place: StagePlace, playerColor: SharedValue<string>) {
	const look = stageLook(place);
	const portal = useSharedValue<Portal>(PLAY_ALL);
	useEffect(() => {
		if (look.portal === "play") portal.set(PLAY_ALL);
		else if (look.portal === "pause") portal.set(PAUSE_ALL);
	}, [look.portal, portal]);
	const portalClip = useDerivedValue(() => {
		const { x, y, radius } = portal.get();
		return rrect(rect(x - radius, y - radius, 2 * radius, 2 * radius), radius, radius);
	});
	const clipsOut = useDerivedValue(() => {
		const shows = playShows(portal.get());
		return shows === "all" || shows === "outside";
	});
	const frost = useStageValue(0, look.frost);
	const washInPlayer = look.accent === "player";
	const accent = useDerivedValue(() => (washInPlayer ? playerColor.get() : INK_LIFT));
	const stageOpacity = useStageValue(1, look.opacity);
	// One cut for every canvas, and only while the pause world is under them: play pays for no clip
	const cut = useMemo<PortalCut | null>(
		() => (look.pauseWorld ? { clip: portalClip, out: clipsOut } : null),
		[look.pauseWorld, portalClip, clipsOut],
	);
	return {
		pauseWorld: look.pauseWorld,
		hudScore: look.hudScore,
		frost,
		portal,
		cut,
		accent,
		stageOpacity,
	};
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
