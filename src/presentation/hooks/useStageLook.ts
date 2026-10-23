import { rect, rrect, type SkRRect } from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import {
	type SharedValue,
	useDerivedValue,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { NO_PORTAL, type Portal } from "../effects/portal";
import { hasPauseWorld, type StageMove, type StagePlace, stageLook } from "../effects/stageLook";
import { INK_LIFT } from "../theme/theme";

/** How the play side is cut over the pause world (see PlaySide): a circle, and which side of it shows */
export interface PortalCut {
	clip: SharedValue<SkRRect> | SkRRect;
	/** The play side shows outside the circle (the bloom's portal), not inside it */
	out: SharedValue<boolean> | boolean;
}

/** None of the play side shows: cut to the inside of a circle of no size */
const NOTHING_SHOWS: PortalCut = { clip: rrect(rect(0, 0, 0, 0), 0, 0), out: false };

/**
 * Applies the field's look behind the screen (see stageLook.ts) to the shared values the
 * canvases draw from. Each value starts its move only when the move itself changes, so a look
 * that stays the same restarts nothing. This is the only writer of the stage opacity. A wash in
 * the player's colour follows `playerColor` on the UI thread, so a colour switch in play renders
 * nothing.
 *
 * Every canvas on the play side is cut the same way over the pause world, by `cut`: to nothing
 * on the pause, and to the portal while the bloom or Get ready runs. Those two own `portal` and
 * set it as they open (see usePortalStepper); the circle and its side are worked out once a
 * frame for all of the canvases, and only while the portal moves. `cut` is null in play, which
 * is cut nowhere, and otherwise the same object for as long as it applies, so no canvas sees a
 * new cut each render.
 */
export function useStageLook(place: StagePlace, playerColor: SharedValue<string>) {
	const look = stageLook(place);
	const portal = useSharedValue<Portal>(NO_PORTAL);
	const portalClip = useDerivedValue(() => {
		const { x, y, radius } = portal.get();
		return rrect(rect(x - radius, y - radius, 2 * radius, 2 * radius), radius, radius);
	});
	// The bloom's portal has the pause inside it, so play shows outside; Get ready's has play inside
	const playOutside = useDerivedValue(() => portal.get().inside === "pause");
	const frost = useStageValue(0, look.frost);
	const washInPlayer = look.accent === "player";
	const accent = useDerivedValue(() => (washInPlayer ? playerColor.get() : INK_LIFT));
	const stageOpacity = useStageValue(1, look.opacity);
	const cut = useMemo<PortalCut | null>(() => {
		switch (look.playShows) {
			case "all":
				return null;
			case "none":
				return NOTHING_SHOWS;
			case "portal":
				return { clip: portalClip, out: playOutside };
		}
	}, [look.playShows, portalClip, playOutside]);
	return {
		pauseWorld: hasPauseWorld(look.playShows),
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
