import { useEffect, useEffectEvent } from "react";
import type { FlowEvent } from "../flow/screenFlow";

/** How long the title shows before a run starts by itself */
const AUTO_START_DELAY_MS = 2000;

/**
 * Start a run in `color` once the title is up, as PLAY pressed in the middle of the screen;
 * nothing when `color` is unset. For the bench run (see application/bench.ts), whose level pose
 * stays flat (see TiltSource).
 */
export function useAutoStart(color: string | undefined, dispatch: (event: FlowEvent) => void) {
	const start = useEffectEvent((startColor: string) =>
		dispatch({ type: "startPressed", color: startColor, at: { x: 200, y: 400 } }),
	);
	useEffect(() => {
		if (!color) return;
		const timer = setTimeout(() => start(color), AUTO_START_DELAY_MS);
		return () => clearTimeout(timer);
	}, [color]);
}
