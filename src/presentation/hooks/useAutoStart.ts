import { useEffect, useEffectEvent } from "react";
import type { FlowEvent } from "../flow/screenFlow";

/** How long the title shows before a run starts by itself */
const AUTO_START_DELAY_MS = 2000;

/**
 * Start a run in `color` once the title is up, straight into play from the middle of the screen,
 * without asking for a level pose; nothing when `color` is unset. For the bench run (see
 * application/bench.ts).
 */
export function useAutoStart(color: string | undefined, dispatch: (event: FlowEvent) => void) {
	const start = useEffectEvent((startColor: string) =>
		dispatch({ type: "autoStarted", color: startColor, at: { x: 200, y: 400 } }),
	);
	useEffect(() => {
		if (!color) return;
		const timer = setTimeout(() => start(color), AUTO_START_DELAY_MS);
		return () => clearTimeout(timer);
	}, [color]);
}
